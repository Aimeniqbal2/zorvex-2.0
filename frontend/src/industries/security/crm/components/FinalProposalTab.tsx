import React, { useState, useEffect, useMemo } from 'react';
import type {
    SecurityProposal, ProposalVersion, ProposalServiceLine,
    ContractEquipmentRequirement, ProposalAdditionalCharge,
    SecurityAssessment, ClientLocation, SecurityServiceType
} from '../api';
import {
    getProposalVersions, updateProposalVersion, importAssessmentRecommendations,
    createProposalServiceLine, updateProposalServiceLine,
    deleteProposalServiceLine, createContractEquipment, updateContractEquipment,
    deleteContractEquipment, createProposalAdditionalCharge, updateProposalAdditionalCharge,
    deleteProposalAdditionalCharge, prepareFinalProposalEmail, sendFinalProposalEmail,
    syncProposalToOperations
} from '../api';
import { ImportRecommendationsModal } from './ImportRecommendationsModal';
import { AddServiceLineModal } from './AddServiceLineModal';
import { AddEquipmentRequirementModal } from './AddEquipmentRequirementModal';
import { AddAdditionalChargeModal } from './AddAdditionalChargeModal';
import { TemporaryServiceModal } from '../../../../modules/security-operations/components/TemporaryServiceModal';
import { apiClient } from '../../../../api/client';
import { deleteTemporaryService, generateTemporaryInvoice } from '../../../../modules/security-operations/api';
import { ToggleSwitch } from './ToggleSwitch';
import EmailComposer from '../../../../components/communications/EmailComposer';
import { useToastStore } from '../../../../stores/toastStore';
import '../styles/FinalProposalTab.css';

interface FinalProposalTabProps {
    proposal: SecurityProposal;
    assessments: SecurityAssessment[];
    locations: ClientLocation[];
    serviceTypes: SecurityServiceType[];
    onRefresh: () => Promise<void>;
}
export const FinalProposalTab: React.FC<FinalProposalTabProps> = ({
    proposal,
    assessments,
    locations,
    serviceTypes,
    onRefresh
}) => {
    const [versions, setVersions] = useState<ProposalVersion[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

    // Modals
    const [showImportModal, setShowImportModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [editingServiceLine, setEditingServiceLine] = useState<ProposalServiceLine | null>(null);
    const [showEquipmentModal, setShowEquipmentModal] = useState(false);
    const [editingEquipment, setEditingEquipment] = useState<ContractEquipmentRequirement | null>(null);
    const [showChargeModal, setShowChargeModal] = useState(false);
    const [editingCharge, setEditingCharge] = useState<ProposalAdditionalCharge | null>(null);

    // Temporary Services state
    const [tempServices, setTempServices] = useState<any[]>([]);
    const [isLoadingTempServices, setIsLoadingTempServices] = useState(false);
    const [showTempServiceModal, setShowTempServiceModal] = useState(false);
    const [editingTempService, setEditingTempService] = useState<any | null>(null);
    const [generatingInvoiceId, setGeneratingInvoiceId] = useState<string | null>(null);

    const customerId = (proposal as any)?.customer_id || (proposal as any)?.crm_entity || (proposal?.customer
        ? (typeof proposal.customer === 'object' ? (proposal.customer as any).id : proposal.customer)
        : (locations?.[0]?.customer || null));
    const customerName = proposal?.customer_name || (proposal as any)?.customer_title || (locations?.[0] as any)?.customer_name || '';
    const locationId = proposal?.location || locations?.[0]?.id || null;
    const locationName = locations?.find(l => l.id === locationId)?.name || proposal?.location_name || locations?.[0]?.name || '';

    const loadTempServices = async () => {
        if (!customerId) return;
        try {
            setIsLoadingTempServices(true);
            let url = `/api/operations/temporary-services/?crm_entity=${customerId}`;
            if (locationId) {
                url += `&operational_site=${locationId}`;
            }
            if (locationName) {
                url += `&site_name=${encodeURIComponent(locationName)}`;
            }
            const res = await apiClient.get(url);
            let loaded = res.data.results || res.data || [];
            if (loaded.length === 0 && (locationId || locationName)) {
                const allRes = await apiClient.get('/api/operations/temporary-services/?crm_entity=' + customerId);
                const allLoaded = allRes.data.results || allRes.data || [];
                loaded = allLoaded.filter((s: any) => {
                    const sSiteName = (s.site_name || s.operational_site_name || '').trim().toLowerCase();
                    const sLocId = String(s.operational_site || s.operational_site_id || '').toLowerCase();
                    return (locationName && sSiteName === locationName.trim().toLowerCase()) ||
                        (locationId && sLocId === String(locationId).toLowerCase());
                });
            }
            setTempServices(loaded);
        } catch (err) {
            console.error('Failed loading location temporary services', err);
        } finally {
            setIsLoadingTempServices(false);
        }
    };

    useEffect(() => {
        loadTempServices();
    }, [customerId, locationId, locationName]);

    const handleDeleteTempService = async (id: string, ref: string) => {
        if (!window.confirm(`Are you sure you want to delete temporary service ${ref}?`)) return;
        try {
            await deleteTemporaryService(id);
            useToastStore.getState().success(`Temporary service ${ref} deleted.`);
            await loadTempServices();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || 'Failed to delete temporary service.');
        }
    };

    const handleGenerateInvoice = async (svc: any) => {
        try {
            setGeneratingInvoiceId(svc.id);
            const res = await generateTemporaryInvoice(svc.id);
            useToastStore.getState().success(`Invoice ${res.invoice_number} generated successfully! Amount: ₨ ${Number(res.total_amount || 0).toLocaleString()}`);
            await loadTempServices();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || 'Failed to generate invoice.');
        } finally {
            setGeneratingInvoiceId(null);
        }
    };

    // Email Composer
    const [showEmailComposer, setShowEmailComposer] = useState(false);
    const [emailPrefill, setEmailPrefill] = useState({ subject: '', body: '', to: '' });

    // Commercial Terms form state for active version
    const [termsState, setTermsState] = useState<{
        billing_cycle: 'MONTHLY' | 'BI_WEEKLY' | 'CUSTOM';
        payment_terms: 'DUE_ON_RECEIPT' | 'NET_15' | 'NET_30' | 'NET_60' | 'ADVANCE' | 'CUSTOM';
        proposal_validity_days: number;
        contract_duration_months: number;
        expected_start_date: string;
        security_deposit: number | string;
        discount_type: 'NONE' | 'FIXED' | 'PERCENTAGE';
        discount_value: number | string;
        tax_rate: number | string;
        overhead_per_guard: number | string;
        service_charges_per_guard: number | string;
        sales_tax_basis: 'TOTAL_SALE' | 'SERVICE_CHARGES' | 'MANUAL';
        sales_tax_override: number | string;
        withholding_tax_rate: number | string;
        withholding_tax_basis: 'INVOICE_AMOUNT' | 'SERVICE_CHARGES' | 'MANUAL';
        withholding_tax_override: number | string;
        total_sessi: number | string;
        total_eobi: number | string;
        eobi_enabled: boolean;
        eobi_rate: number | string;
        sessi_enabled: boolean;
        sessi_minimum_wage: number | string;
        sessi_percentage: number | string;
        admin_charges_enabled: boolean;
        admin_charges_percentage: number | string;
        insurance_enabled: boolean;
        insurance_percentage: number | string;
        commercial_notes: string;
        terms_and_conditions: string;
    }>({
        billing_cycle: 'MONTHLY',
        payment_terms: 'NET_30',
        proposal_validity_days: 30,
        contract_duration_months: 12,
        expected_start_date: '',
        security_deposit: 0,
        discount_type: 'NONE',
        discount_value: 0,
        tax_rate: 8,
        overhead_per_guard: 6000,
        service_charges_per_guard: 3000,
        sales_tax_basis: 'TOTAL_SALE',
        sales_tax_override: '',
        withholding_tax_rate: 7,
        withholding_tax_basis: 'INVOICE_AMOUNT',
        withholding_tax_override: '',
        total_sessi: 0,
        total_eobi: 0,
        eobi_enabled: false,
        eobi_rate: 1500,
        sessi_enabled: false,
        sessi_minimum_wage: 37000,
        sessi_percentage: 6,
        admin_charges_enabled: false,
        admin_charges_percentage: 5,
        insurance_enabled: false,
        insurance_percentage: 2,
        commercial_notes: '',
        terms_and_conditions: ''
    });

    const [savingTerms, setSavingTerms] = useState(false);

    const loadVersions = async () => {
        try {
            const data: ProposalVersion[] = await getProposalVersions(proposal.id);
            setVersions(data || []);
            if (data && data.length > 0) {
                const finalVer = data.find((v: ProposalVersion) => v.version_type?.toLowerCase().includes('final')) || data[0];
                setSelectedVersionId(prev => (prev && data.some((v: ProposalVersion) => v.id === prev) ? prev : finalVer.id));
            }
        } catch (err) {
            console.error('Failed to load proposal versions', err);
            useToastStore.getState().error('Failed to load proposal versions.');
        }
    };

    useEffect(() => {
        loadVersions();
    }, [proposal.id]);

    const activeVersion = versions.find(v => v.id === selectedVersionId) || versions[0];

    useEffect(() => {
        if (activeVersion) {
            setTermsState({
                billing_cycle: activeVersion.billing_cycle || 'MONTHLY',
                payment_terms: activeVersion.payment_terms || 'NET_30',
                proposal_validity_days: activeVersion.proposal_validity_days || 30,
                contract_duration_months: activeVersion.contract_duration_months || 12,
                expected_start_date: activeVersion.expected_start_date || '',
                security_deposit: activeVersion.security_deposit || 0,
                discount_type: activeVersion.discount_type || 'NONE',
                discount_value: activeVersion.discount_value || 0,
                tax_rate: activeVersion.tax_rate ?? 8,
                overhead_per_guard: activeVersion.overhead_per_guard ?? 6000,
                service_charges_per_guard: activeVersion.service_charges_per_guard ?? 3000,
                sales_tax_basis: (activeVersion.sales_tax_basis as any) === 'INVOICE_AMOUNT' ? 'TOTAL_SALE' : ((activeVersion.sales_tax_basis as any) || (activeVersion.sales_tax_override !== null && activeVersion.sales_tax_override !== undefined ? 'MANUAL' : 'TOTAL_SALE')),
                sales_tax_override: activeVersion.sales_tax_override ?? '',
                withholding_tax_rate: activeVersion.withholding_tax_rate ?? 7,
                withholding_tax_basis: (activeVersion.withholding_tax_basis as any) || (activeVersion.withholding_tax_override !== null && activeVersion.withholding_tax_override !== undefined ? 'MANUAL' : 'INVOICE_AMOUNT'),
                withholding_tax_override: activeVersion.withholding_tax_override ?? '',
                total_sessi: activeVersion.total_sessi ?? 0,
                total_eobi: activeVersion.total_eobi ?? 0,
                eobi_enabled: activeVersion.eobi_enabled !== undefined ? !!activeVersion.eobi_enabled : false,
                eobi_rate: activeVersion.eobi_rate ?? 1500,
                sessi_enabled: activeVersion.sessi_enabled !== undefined ? !!activeVersion.sessi_enabled : false,
                sessi_minimum_wage: activeVersion.sessi_minimum_wage ?? 37000,
                sessi_percentage: activeVersion.sessi_percentage ?? 6,
                admin_charges_enabled: activeVersion.admin_charges_enabled !== undefined ? !!activeVersion.admin_charges_enabled : false,
                admin_charges_percentage: activeVersion.admin_charges_percentage ?? 5,
                insurance_enabled: activeVersion.insurance_enabled !== undefined ? !!activeVersion.insurance_enabled : false,
                insurance_percentage: activeVersion.insurance_percentage ?? 2,
                commercial_notes: activeVersion.commercial_notes || '',
                terms_and_conditions: activeVersion.terms_and_conditions || ''
            });
        }
    }, [activeVersion?.id]);

    // Live calculation engine for Costing & Taxes matching Fast Costing Grid / Sheet 1 formulas
    const liveCosting = useMemo(() => {
        const totalStrength = Number(activeVersion?.total_guard_strength ?? 0);
        const monthlySale = Number(activeVersion?.total_monthly_sale ?? 0);
        const monthlySalary = Number(activeVersion?.total_monthly_salary ?? 0);

        const overheadPerGuard = Number(termsState.overhead_per_guard !== '' && termsState.overhead_per_guard !== undefined ? termsState.overhead_per_guard : (activeVersion?.overhead_per_guard ?? 6000));
        const totalExpense = totalStrength * overheadPerGuard;

        const serviceChargesPerGuard = Number(termsState.service_charges_per_guard !== '' && termsState.service_charges_per_guard !== undefined ? termsState.service_charges_per_guard : (activeVersion?.service_charges_per_guard ?? 0));
        const totalServiceCharges = serviceChargesPerGuard;

        // Sales Tax Engine (Matching Sheet 1 / Fast Costing Grid)
        // 1. TOTAL_SALE: Total Monthly Sale × %
        // 2. SERVICE_CHARGES: Total Count × Service Charges × %
        // 3. MANUAL: Sales Tax Override in PKR
        const stRate = Number(termsState.tax_rate !== '' && termsState.tax_rate !== undefined ? termsState.tax_rate : (activeVersion?.tax_rate ?? 8));
        const rawStBasis = termsState.sales_tax_basis || activeVersion?.sales_tax_basis || 'TOTAL_SALE';
        const stBasis = (rawStBasis as string) === 'INVOICE_AMOUNT' ? 'TOTAL_SALE' : rawStBasis;
        let salesTax = 0;
        if (stBasis === 'MANUAL') {
            salesTax = Number(termsState.sales_tax_override !== '' && termsState.sales_tax_override !== undefined ? termsState.sales_tax_override : (activeVersion?.sales_tax_override ?? 0));
        } else if (stBasis === 'SERVICE_CHARGES') {
            const count = totalStrength > 0 ? totalStrength : 1;
            salesTax = (count * serviceChargesPerGuard) * (stRate / 100);
        } else {
            salesTax = monthlySale * (stRate / 100);
        }

        const invoiceAmount = monthlySale + salesTax;

        // Withholding Tax Engine (Matching Sheet 1 / Fast Costing Grid)
        // 1. INVOICE_AMOUNT: Invoice Amount × %
        // 2. SERVICE_CHARGES: Total Count × Service Charges × %
        // 3. MANUAL: WHT Override in PKR
        const whtRate = Number(termsState.withholding_tax_rate !== '' && termsState.withholding_tax_rate !== undefined ? termsState.withholding_tax_rate : (activeVersion?.withholding_tax_rate ?? 7));
        const whtBasis = termsState.withholding_tax_basis || activeVersion?.withholding_tax_basis || 'INVOICE_AMOUNT';
        let wht = 0;
        if (whtBasis === 'MANUAL') {
            wht = Number(termsState.withholding_tax_override !== '' && termsState.withholding_tax_override !== undefined ? termsState.withholding_tax_override : (activeVersion?.withholding_tax_override ?? 0));
        } else if (whtBasis === 'SERVICE_CHARGES') {
            const count = totalStrength > 0 ? totalStrength : 1;
            wht = (count * serviceChargesPerGuard) * (whtRate / 100);
        } else {
            wht = invoiceAmount * (whtRate / 100);
        }

        // Statutory & Charges Formulas & Toggles
        const eobiRate = Number(termsState.eobi_rate ?? activeVersion?.eobi_rate ?? 1500);
        const eobi = termsState.eobi_enabled ? (eobiRate * totalStrength) : 0;

        const sessiMinWage = Number(termsState.sessi_minimum_wage ?? activeVersion?.sessi_minimum_wage ?? 37000);
        const sessiPct = Number(termsState.sessi_percentage ?? activeVersion?.sessi_percentage ?? 6);
        const sessiRate = sessiMinWage * (sessiPct / 100);
        const sessi = termsState.sessi_enabled ? (sessiRate * totalStrength) : 0;

        const adminPct = Number(termsState.admin_charges_percentage ?? activeVersion?.admin_charges_percentage ?? 5);
        const adminCharges = termsState.admin_charges_enabled ? (monthlySale * (adminPct / 100)) : 0;

        const insPct = Number(termsState.insurance_percentage ?? activeVersion?.insurance_percentage ?? 2);
        const insurance = termsState.insurance_enabled ? (monthlySale * (insPct / 100)) : 0;

        const difference = monthlySale - monthlySalary - wht - sessi - eobi - adminCharges - insurance;
        const diffPerHead = totalStrength > 0 ? (difference / totalStrength) : 0;
        const profitLoss = monthlySale - monthlySalary - totalExpense - wht - adminCharges - insurance;

        return {
            totalStrength,
            monthlySale,
            monthlySalary,
            overheadPerGuard,
            totalExpense,
            serviceChargesPerGuard,
            totalServiceCharges,
            salesTaxRate: stRate,
            salesTax: Math.round(salesTax * 100) / 100,
            invoiceAmount: Math.round(invoiceAmount * 100) / 100,
            taxWhtRate: whtRate,
            wht: Math.round(wht * 100) / 100,
            sessi,
            sessiRate,
            sessiMinWage,
            sessiPct,
            eobi,
            eobiRate,
            adminCharges,
            adminPct,
            insurance,
            insPct,
            difference: Math.round(difference * 100) / 100,
            diffPerHead: Math.round(diffPerHead * 100) / 100,
            profitLoss: Math.round(profitLoss * 100) / 100
        };
    }, [activeVersion, termsState]);

    const handleSaveTerms = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeVersion) return;
        if (activeVersion.is_frozen) {
            useToastStore.getState().error('Cannot modify terms of a frozen proposal version.');
            return;
        }

        setSavingTerms(true);
        try {
            await updateProposalVersion(activeVersion.id, {
                ...termsState,
                security_deposit: Number(termsState.security_deposit) || 0,
                discount_value: Number(termsState.discount_value) || 0,
                tax_rate: (termsState.tax_rate !== '' && termsState.tax_rate !== null && termsState.tax_rate !== undefined) ? Number(termsState.tax_rate) : 0,
                overhead_per_guard: (termsState.overhead_per_guard !== '' && termsState.overhead_per_guard !== null && termsState.overhead_per_guard !== undefined) ? Number(termsState.overhead_per_guard) : 6000,
                service_charges_per_guard: (termsState.service_charges_per_guard !== '' && termsState.service_charges_per_guard !== null && termsState.service_charges_per_guard !== undefined) ? Number(termsState.service_charges_per_guard) : 0,
                sales_tax_override: termsState.sales_tax_basis === 'MANUAL' && termsState.sales_tax_override !== '' ? Number(termsState.sales_tax_override) : (termsState.sales_tax_basis === 'MANUAL' ? 0 : null),
                withholding_tax_rate: (termsState.withholding_tax_rate !== '' && termsState.withholding_tax_rate !== null && termsState.withholding_tax_rate !== undefined) ? Number(termsState.withholding_tax_rate) : 0,
                withholding_tax_override: termsState.withholding_tax_basis === 'MANUAL' && termsState.withholding_tax_override !== '' ? Number(termsState.withholding_tax_override) : (termsState.withholding_tax_basis === 'MANUAL' ? 0 : null),
                eobi_enabled: !!termsState.eobi_enabled,
                eobi_rate: Number(termsState.eobi_rate) || 1500,
                sessi_enabled: !!termsState.sessi_enabled,
                sessi_minimum_wage: Number(termsState.sessi_minimum_wage) || 37000,
                sessi_percentage: Number(termsState.sessi_percentage) || 6,
                admin_charges_enabled: !!termsState.admin_charges_enabled,
                admin_charges_percentage: Number(termsState.admin_charges_percentage) || 5,
                insurance_enabled: !!termsState.insurance_enabled,
                insurance_percentage: Number(termsState.insurance_percentage) || 2,
                total_sessi: Math.round(liveCosting.sessi),
                total_eobi: Math.round(liveCosting.eobi),
                proposal_validity_days: Number(termsState.proposal_validity_days) || 30,
                contract_duration_months: Number(termsState.contract_duration_months) || 12,
                expected_start_date: termsState.expected_start_date || null
            });
            useToastStore.getState().success('Commercial terms saved successfully.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to save terms.');
        } finally {
            setSavingTerms(false);
        }
    };

    const handleImportRecommendations = async (selectedAssessmentIds?: string[]) => {
        if (!activeVersion) return;
        try {
            const res = await importAssessmentRecommendations(proposal.id, {
                version_id: activeVersion.id,
                assessment_ids: selectedAssessmentIds
            });
            useToastStore.getState().success(res.message || 'Assessment recommendations imported successfully.');
            setShowImportModal(false);
            await loadVersions();
            await onRefresh();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.message || 'Failed to import recommendations.');
        }
    };

    // Service Line actions
    const handleSaveServiceLine = async (payload: Partial<ProposalServiceLine>) => {
        if (editingServiceLine) {
            await updateProposalServiceLine(editingServiceLine.id, payload);
            useToastStore.getState().success('Service requirement updated.');
        } else {
            await createProposalServiceLine(payload);
            useToastStore.getState().success('Service requirement added.');
        }
        await loadVersions();
    };

    const handleDeleteServiceLine = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this service line?')) return;
        try {
            await deleteProposalServiceLine(id);
            useToastStore.getState().success('Service line removed.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to delete service line.');
        }
    };

    // Equipment actions
    const handleSaveEquipment = async (payload: Partial<ContractEquipmentRequirement>) => {
        if (editingEquipment) {
            await updateContractEquipment(editingEquipment.id, payload);
            useToastStore.getState().success('Equipment requirement updated.');
        } else {
            await createContractEquipment(payload);
            useToastStore.getState().success('Equipment requirement added.');
        }
        await loadVersions();
    };

    const handleDeleteEquipment = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this equipment requirement?')) return;
        try {
            await deleteContractEquipment(id);
            useToastStore.getState().success('Equipment requirement removed.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to delete equipment.');
        }
    };

    // Additional Charge actions
    const handleSaveCharge = async (payload: Partial<ProposalAdditionalCharge>) => {
        if (editingCharge) {
            await updateProposalAdditionalCharge(editingCharge.id, payload);
            useToastStore.getState().success('Commercial charge updated.');
        } else {
            await createProposalAdditionalCharge(payload);
            useToastStore.getState().success('Commercial charge added.');
        }
        await loadVersions();
    };

    const handleDeleteCharge = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this charge?')) return;
        try {
            await deleteProposalAdditionalCharge(id);
            useToastStore.getState().success('Charge removed.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to delete charge.');
        }
    };

    // Email workflow trigger
    const handleOpenEmailComposer = async () => {
        if (!activeVersion) return;
        try {
            const res = await prepareFinalProposalEmail(proposal.id, activeVersion.id);
            setEmailPrefill({
                subject: res.subject || '',
                body: res.body || '',
                to: res.to || ''
            });
            setShowEmailComposer(true);
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || 'Failed to prepare email context.');
        }
    };

    const handleEmailSent = async () => {
        useToastStore.getState().success('Final Proposal sent successfully! Proposal is now Awaiting Approval.');
        setShowEmailComposer(false);
        await loadVersions();
        await onRefresh();
    };

    const isFrozen = activeVersion?.is_frozen ?? false;
    const isFinalStage = proposal.status === 'FINAL_PROPOSAL' || proposal.status === 'AWAITING_APPROVAL';

    return (
        <div className="fp-container">
            {/* Email Composer Modal */}
            {showEmailComposer && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)', padding: '16px' }}>
                    <div style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <EmailComposer
                            contextType="security_proposal"
                            contextId={proposal.id}
                            contextVersionId={activeVersion?.id}
                            prefillTo={emailPrefill.to}
                            prefillSubject={emailPrefill.subject}
                            prefillBodyHtml={emailPrefill.body}
                            onTriggerSend={async (emailId: string) => {
                                await sendFinalProposalEmail(proposal.id, {
                                    email_id: emailId,
                                    version_id: activeVersion?.id
                                });
                            }}
                            onSent={handleEmailSent}
                            onCancel={() => setShowEmailComposer(false)}
                        />
                    </div>
                </div>
            )}

            {/* 1. Hero / Requirements Bar */}
            <div className="fp-version-bar">
                <div className="fp-version-info">
                    <div className="fp-version-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                        <i className='bx bx-check-shield'></i>
                    </div>
                    <div className="fp-version-title-group">
                        <div className="fp-version-title-row">
                            <h2 className="fp-version-title">Service & Staffing Requirements Sheet</h2>
                            <span className="fp-version-count-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                                Live in Operations
                            </span>
                        </div>
                        <p className="fp-version-desc">
                            Direct operational post specifications, headcount requirements, weapons, billing rates, and staff salaries.
                        </p>
                    </div>
                </div>

                <div className="fp-version-pills">
                    {versions.map(v => {
                        const isActive = v.id === activeVersion?.id;
                        return (
                            <button
                                key={v.id}
                                onClick={() => setSelectedVersionId(v.id)}
                                className={`fp-version-pill ${isActive ? 'active' : ''}`}
                            >
                                <span>Requirements Sheet {v.version_number}</span>
                                <span className="fp-pill-tag active" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                                    <i className='bx bx-check-circle'></i> Final & Live
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. Action Toolbar */}
            <div className="fp-action-bar">
                <div className="fp-action-left">
                    <button
                        onClick={() => {
                            setEditingServiceLine(null);
                            setShowServiceModal(true);
                        }}
                        className="fp-btn-action btn-guard"
                    >
                        <i className='bx bx-user-plus'></i> + Add Guard Service
                    </button>
                    <button
                        onClick={() => {
                            setEditingEquipment(null);
                            setShowEquipmentModal(true);
                        }}
                        className="fp-btn-action btn-equipment"
                    >
                        <i className='bx bx-wrench'></i> + Add Equipment
                    </button>
                    <button
                        onClick={() => {
                            setEditingCharge(null);
                            setShowChargeModal(true);
                        }}
                        className="fp-btn-action btn-charge"
                    >
                        <i className='bx bx-briefcase-alt'></i> + Add Commercial Charge
                    </button>
                    <button
                        onClick={() => {
                            setEditingTempService(null);
                            setShowTempServiceModal(true);
                        }}
                        className="fp-btn-action"
                        style={{
                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.2))',
                            color: '#d97706',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            fontWeight: 600
                        }}
                    >
                        <i className='bx bx-bolt-circle'></i> + Add Temporary Service
                    </button>
                </div>

                <div>
                    <button
                        onClick={async () => {
                            try {
                                const res = await syncProposalToOperations(proposal.id);
                                useToastStore.getState().success(res.message || 'Requirements successfully synced into Operations!');
                                await onRefresh();
                            } catch (err: any) {
                                useToastStore.getState().error('Failed to sync to Operations');
                            }
                        }}
                        className="fp-btn-send-main"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                        <i className='bx bx-sync'></i> Save & Sync to Operations
                    </button>
                </div>
            </div>

            {/* 3. Main Two-Column Layout */}
            <div className="fp-main-grid">
                {/* Left Side: Tables & Contract Terms */}
                <div className="fp-left-stack">
                    {/* Section 1: Personnel Requirements & Guard Services */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon guard">
                                    <i className='bx bx-shield-quarter'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Personnel & Guard Requirements</h3>
                                    <p className="fp-card-subtitle">Operational security posts, client monthly rates, and OT billings</p>
                                </div>
                            </div>
                            <span className="fp-card-count">
                                {activeVersion?.service_lines?.length || 0} Line(s)
                            </span>
                        </div>

                        <div className="fp-table-wrapper">
                            <table className="fp-table">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Role / Category</th>
                                        <th>Weapon & Shift</th>
                                        <th style={{ textAlign: 'center' }}>Qty</th>
                                        <th style={{ textAlign: 'right' }}>Sale Rate</th>
                                        <th style={{ textAlign: 'right', color: '#fbbf24' }}>Guard Salary</th>
                                        <th style={{ textAlign: 'right' }}>Monthly Sale</th>
                                        <th style={{ textAlign: 'right', color: '#fbbf24' }}>Direct Salary</th>
                                        <th style={{ textAlign: 'right', color: '#38bdf8' }}>Gross Margin</th>
                                        <th style={{ textAlign: 'right' }}>Diff / Head</th>
                                        {!isFrozen && <th style={{ textAlign: 'center' }}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!activeVersion?.service_lines || activeVersion.service_lines.length === 0) ? (
                                        <tr>
                                            <td colSpan={isFrozen ? 10 : 11} className="fp-table-empty">
                                                No guard requirements added yet. Click [Import Recommendations] or [+ Add Guard Service].
                                            </td>
                                        </tr>
                                    ) : (
                                        activeVersion.service_lines.map(line => {
                                            const qty = Number(line.quantity || 1);
                                            const sale = Number(line.client_rate || 0);
                                            const sal = Number(line.guard_salary || 0);
                                            const lineSale = qty * sale;
                                            const lineSalary = qty * sal;
                                            const lineMargin = lineSale - lineSalary;
                                            const diffHead = sale - sal;

                                            return (
                                                <tr key={line.id}>
                                                    <td style={{ fontWeight: 600 }}>
                                                        {line.location_name || 'All Locations'}
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: '#38bdf8' }}>{line.service_type_name || 'Guard Service'}</div>
                                                        {line.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{line.notes}</div>}
                                                    </td>
                                                    <td>
                                                        <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text)' }}>
                                                            {line.weapon_type ? line.weapon_type.replace(/_/g, ' ') : 'Unarmed'}
                                                        </div>
                                                        <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)' }}>
                                                            {line.shift_hours ? line.shift_hours.replace(/_/g, ' ') : '12 Hours'}
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                                        {qty}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500, color: '#34d399' }}>
                                                        PKR {sale.toLocaleString()}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#fbbf24' }}>
                                                        PKR {sal.toLocaleString()}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                                        PKR {lineSale.toLocaleString()}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#f59e0b' }}>
                                                        PKR {lineSalary.toLocaleString()}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: lineMargin >= 0 ? '#38bdf8' : '#ef4444' }}>
                                                        PKR {lineMargin.toLocaleString()}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '11.5px', color: diffHead >= 0 ? '#a78bfa' : '#ef4444' }}>
                                                        PKR {diffHead.toLocaleString()}
                                                    </td>
                                                    {!isFrozen && (
                                                        <td>
                                                            <div className="fp-table-actions">
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingServiceLine(line);
                                                                        setShowServiceModal(true);
                                                                    }}
                                                                    className="fp-btn-icon"
                                                                    title="Edit Line"
                                                                >
                                                                    <i className='bx bx-edit'></i>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteServiceLine(line.id)}
                                                                    className="fp-btn-icon delete"
                                                                    title="Delete Line"
                                                                >
                                                                    <i className='bx bx-trash'></i>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 2: Security Equipment & Hardware Requirements */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon equip">
                                    <i className='bx bx-cctv'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Security Hardware & Equipment Requirements</h3>
                                    <p className="fp-card-subtitle">CCTV, turnstiles, radios, metal detectors, and safety gear</p>
                                </div>
                            </div>
                            <span className="fp-card-count">
                                {activeVersion?.equipment_requirements?.length || 0} Item(s)
                            </span>
                        </div>

                        <div className="fp-table-wrapper">
                            <table className="fp-table">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Equipment Description</th>
                                        <th style={{ textAlign: 'center' }}>Qty</th>
                                        <th>Schedule</th>
                                        <th style={{ textAlign: 'right' }}>Unit Rate</th>
                                        <th style={{ textAlign: 'right' }}>Line Total</th>
                                        {!isFrozen && <th style={{ textAlign: 'center' }}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!activeVersion?.equipment_requirements || activeVersion.equipment_requirements.length === 0) ? (
                                        <tr>
                                            <td colSpan={isFrozen ? 6 : 7} className="fp-table-empty">
                                                No equipment requirements added yet. Click [Import Recommendations] or [+ Add Equipment].
                                            </td>
                                        </tr>
                                    ) : (
                                        activeVersion.equipment_requirements.map(equip => (
                                            <tr key={equip.id}>
                                                <td style={{ fontWeight: 600 }}>
                                                    {equip.location_name || 'Location'}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#34d399' }}>{equip.item_name || equip.description}</div>
                                                    {equip.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{equip.notes}</div>}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                                    {equip.quantity}
                                                </td>
                                                <td>
                                                    <span className={`fp-tag ${equip.charge_type === 'MONTHLY' ? 'monthly' : 'onetime'}`}>
                                                        {equip.charge_type === 'MONTHLY' ? 'Monthly Rental' : 'One-Time'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>
                                                    PKR {Number(equip.unit_rate || 0).toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    PKR {(Number(equip.quantity || 1) * Number(equip.unit_rate || 0)).toLocaleString()}
                                                </td>
                                                {!isFrozen && (
                                                    <td>
                                                        <div className="fp-table-actions">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingEquipment(equip);
                                                                    setShowEquipmentModal(true);
                                                                }}
                                                                className="fp-btn-icon"
                                                                title="Edit Equipment"
                                                            >
                                                                <i className='bx bx-edit'></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteEquipment(equip.id)}
                                                                className="fp-btn-icon delete"
                                                                title="Delete Equipment"
                                                            >
                                                                <i className='bx bx-trash'></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 3: Additional Commercial Charges */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon charge">
                                    <i className='bx bx-receipt'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Additional Commercial Charges</h3>
                                    <p className="fp-card-subtitle">Mobilization, transport, installation, training, and operational fees</p>
                                </div>
                            </div>
                            <span className="fp-card-count">
                                {activeVersion?.additional_charges?.length || 0} Charge(s)
                            </span>
                        </div>

                        <div className="fp-table-wrapper">
                            <table className="fp-table">
                                <thead>
                                    <tr>
                                        <th>Charge Description</th>
                                        <th>Schedule</th>
                                        <th style={{ textAlign: 'center' }}>Qty</th>
                                        <th style={{ textAlign: 'right' }}>Amount</th>
                                        <th style={{ textAlign: 'right' }}>Line Total</th>
                                        {!isFrozen && <th style={{ textAlign: 'center' }}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!activeVersion?.additional_charges || activeVersion.additional_charges.length === 0) ? (
                                        <tr>
                                            <td colSpan={isFrozen ? 5 : 6} className="fp-table-empty">
                                                No additional charges configured. Click [+ Add Commercial Charge].
                                            </td>
                                        </tr>
                                    ) : (
                                        activeVersion.additional_charges.map(charge => (
                                            <tr key={charge.id}>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#fbbf24' }}>{charge.charge_name}</div>
                                                    {charge.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{charge.notes}</div>}
                                                </td>
                                                <td>
                                                    <span className={`fp-tag ${charge.charge_type === 'MONTHLY' ? 'monthly' : 'onetime'}`}>
                                                        {charge.charge_type === 'MONTHLY' ? 'Monthly' : 'One-Time'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                                    {charge.quantity}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>
                                                    PKR {Number(charge.amount || 0).toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    PKR {(Number(charge.quantity || 1) * Number(charge.amount || 0)).toLocaleString()}
                                                </td>
                                                {!isFrozen && (
                                                    <td>
                                                        <div className="fp-table-actions">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCharge(charge);
                                                                    setShowChargeModal(true);
                                                                }}
                                                                className="fp-btn-icon"
                                                                title="Edit Charge"
                                                            >
                                                                <i className='bx bx-edit'></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteCharge(charge.id)}
                                                                className="fp-btn-icon delete"
                                                                title="Delete Charge"
                                                            >
                                                                <i className='bx bx-trash'></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 3.5: Temporary Security Services & Event Requirements */}
                    <div className="fp-card" style={{ border: '1px solid rgba(245, 158, 11, 0.35)' }}>
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
                                    <i className='bx bx-bolt-circle'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Temporary Security Services & Event Requirements</h3>
                                    <p className="fp-card-subtitle">
                                        Extra manpower, event security, and rental gear for this location. Synced with Operations Duty Muster.
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span className="fp-card-count" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>
                                    {tempServices.length} Event(s)
                                </span>
                                <button
                                    onClick={() => {
                                        setEditingTempService(null);
                                        setShowTempServiceModal(true);
                                    }}
                                    className="fp-btn-action"
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        background: 'rgba(245, 158, 11, 0.15)',
                                        color: '#d97706',
                                        border: '1px solid rgba(245, 158, 11, 0.35)'
                                    }}
                                >
                                    <i className='bx bx-plus'></i> Add Temporary Service
                                </button>
                            </div>
                        </div>

                        <div className="fp-table-wrapper">
                            <table className="fp-table">
                                <thead>
                                    <tr>
                                        <th>Ref & Event Title</th>
                                        <th>Dates & Duration</th>
                                        <th>Wing A: Manpower</th>
                                        <th>Wing B: Assets & Fleet</th>
                                        <th>Billing Mode</th>
                                        <th style={{ textAlign: 'right' }}>Total (₨)</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoadingTempServices ? (
                                        <tr>
                                            <td colSpan={8} className="fp-table-empty">
                                                <i className="bx bx-loader-alt bx-spin" style={{ marginRight: '6px' }} />
                                                Loading temporary services...
                                            </td>
                                        </tr>
                                    ) : tempServices.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="fp-table-empty">
                                                No temporary security services booked for this location yet. Click [+ Add Temporary Service] to schedule event guards or rental equipment.
                                            </td>
                                        </tr>
                                    ) : (
                                        tempServices.map(ts => {
                                            const sDate = ts.start_datetime ? new Date(ts.start_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
                                            const eDate = ts.end_datetime ? new Date(ts.end_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
                                            const mLines = ts.lines?.filter((l: any) => l.line_type === 'MANPOWER') || [];
                                            const eqLines = ts.lines?.filter((l: any) => l.line_type !== 'MANPOWER') || [];

                                            return (
                                                <tr key={ts.id}>
                                                    <td>
                                                        <div style={{ fontWeight: 700, color: '#2563eb' }}>{ts.reference_number}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{ts.title || 'Event Security'}</div>
                                                    </td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>
                                                        <div>{sDate} – {eDate}</div>
                                                        <span style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 600 }}>
                                                            <i className='bx bx-check-circle'></i> Synced to Muster
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {mLines.length === 0 ? <span style={{ color: 'var(--color-text-muted)' }}>—</span> : (
                                                            <div>
                                                                <span style={{ fontWeight: 600 }}>{mLines.reduce((a: number, b: any) => a + (b.required_headcount || 1), 0)} Guard(s)</span>
                                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>₨ {Number(ts.total_manpower_cost || 0).toLocaleString()}</div>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {eqLines.length === 0 ? <span style={{ color: 'var(--color-text-muted)' }}>—</span> : (
                                                            <div>
                                                                <span style={{ fontWeight: 600 }}>{eqLines.length} Item(s)</span>
                                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>₨ {Number(ts.total_equipment_cost || 0).toLocaleString()}</div>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontWeight: 600,
                                                            backgroundColor: ts.billing_type === 'STANDALONE' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                                            color: ts.billing_type === 'STANDALONE' ? '#1d4ed8' : '#047857'
                                                        }}>
                                                            {ts.billing_type === 'STANDALONE' ? 'Standalone' : 'Consolidated'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>
                                                        ₨ {Number(ts.grand_total || 0).toLocaleString()}
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontWeight: 600,
                                                            backgroundColor: ['APPROVED', 'CONFIRMED'].includes(ts.status) ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                                            color: ['APPROVED', 'CONFIRMED'].includes(ts.status) ? '#059669' : '#d97706'
                                                        }}>
                                                            {ts.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                                                            <button
                                                                onClick={() => handleGenerateInvoice(ts)}
                                                                className="fp-btn-icon"
                                                                title="Generate Invoice"
                                                                disabled={generatingInvoiceId === ts.id}
                                                                style={{ color: '#b45309' }}
                                                            >
                                                                <i className='bx bx-receipt'></i>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingTempService(ts);
                                                                    setShowTempServiceModal(true);
                                                                }}
                                                                className="fp-btn-icon"
                                                                title="Edit Service"
                                                            >
                                                                <i className='bx bx-edit'></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteTempService(ts.id, ts.reference_number)}
                                                                className="fp-btn-icon delete"
                                                                title="Delete Service"
                                                            >
                                                                <i className='bx bx-trash'></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 4: Commercial Contract & Payment Terms Form */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon terms">
                                    <i className='bx bx-notepad'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Commercial Contract & Payment Terms</h3>
                                    <p className="fp-card-subtitle">Define contract tenure, billing cycles, payment terms, and legal clauses</p>
                                </div>
                            </div>
                            {!isFrozen && (
                                <button
                                    onClick={handleSaveTerms}
                                    disabled={savingTerms}
                                    className="fp-btn-send-main"
                                    style={{ padding: '6px 14px', fontSize: '12px' }}
                                >
                                    <i className='bx bx-save'></i> {savingTerms ? 'Saving...' : 'Save Terms'}
                                </button>
                            )}
                        </div>

                                                <form onSubmit={handleSaveTerms} className="fp-terms-form">
                            {/* Subpanel 1: Contract Duration & Billing Schedule */}
                            <div className="fp-terms-panel">
                                <div className="fp-terms-panel-header">
                                    <div className="fp-terms-panel-title">
                                        <i className='bx bx-calendar-event' style={{ color: '#0284c7', fontSize: '16px' }}></i>
                                        <span>Contract Duration & Billing Schedule</span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Billing & Validity Parameters</span>
                                </div>

                                <div className="fp-form-row-3">
                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Billing Cycle</label>
                                        <select
                                            disabled={isFrozen}
                                            value={termsState.billing_cycle}
                                            onChange={(e) => setTermsState({ ...termsState, billing_cycle: e.target.value as any })}
                                            className="fp-select"
                                        >
                                            <option value="MONTHLY">Monthly Billing</option>
                                            <option value="BI_WEEKLY">Bi-Weekly</option>
                                            <option value="CUSTOM">Custom Terms</option>
                                        </select>
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Payment Terms</label>
                                        <select
                                            disabled={isFrozen}
                                            value={termsState.payment_terms}
                                            onChange={(e) => setTermsState({ ...termsState, payment_terms: e.target.value as any })}
                                            className="fp-select"
                                        >
                                            <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                                            <option value="NET_15">Net 15 Days</option>
                                            <option value="NET_30">Net 30 Days</option>
                                            <option value="NET_60">Net 60 Days</option>
                                            <option value="ADVANCE">Advance Payment</option>
                                            <option value="CUSTOM">Custom Terms</option>
                                        </select>
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Contract Duration (Months)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            disabled={isFrozen}
                                            value={termsState.contract_duration_months}
                                            onChange={(e) => setTermsState({ ...termsState, contract_duration_months: parseInt(e.target.value) || 12 })}
                                            className="fp-input"
                                        />
                                    </div>
                                </div>

                                <div className="fp-form-row-3">
                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Proposal Validity (Days)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            disabled={isFrozen}
                                            value={termsState.proposal_validity_days}
                                            onChange={(e) => setTermsState({ ...termsState, proposal_validity_days: parseInt(e.target.value) || 30 })}
                                            className="fp-input"
                                        />
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Expected Start Date</label>
                                        <input
                                            type="date"
                                            disabled={isFrozen}
                                            value={termsState.expected_start_date}
                                            onChange={(e) => setTermsState({ ...termsState, expected_start_date: e.target.value })}
                                            className="fp-input"
                                        />
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Security Deposit (PKR)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            disabled={isFrozen}
                                            value={termsState.security_deposit}
                                            onChange={(e) => setTermsState({ ...termsState, security_deposit: e.target.value })}
                                            className="fp-input"
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Subpanel 2: Operational Overheads & Tax Compliance */}
                            <div className="fp-terms-panel">
                                <div className="fp-terms-panel-header">
                                    <div className="fp-terms-panel-title">
                                        <i className='bx bx-calculator' style={{ color: '#059669', fontSize: '16px' }}></i>
                                        <span>Operational Overheads & Tax Compliance</span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Taxes & Overheads</span>
                                </div>

                                <div className="fp-form-row-3">
                                    <div className="fp-form-field">
                                        <label className="fp-field-label">
                                            Operations Overhead / Guard (PKR)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            disabled={isFrozen}
                                            value={termsState.overhead_per_guard}
                                            onChange={(e) => setTermsState({ ...termsState, overhead_per_guard: e.target.value })}
                                            className="fp-input"
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">
                                            Service Charges (PKR) - Flat Monthly
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            disabled={isFrozen}
                                            value={termsState.service_charges_per_guard}
                                            onChange={(e) => setTermsState({ ...termsState, service_charges_per_guard: e.target.value })}
                                            className="fp-input"
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">
                                            Sales Tax Rate (%)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            disabled={isFrozen || termsState.sales_tax_basis === 'MANUAL'}
                                            value={termsState.tax_rate}
                                            onChange={(e) => setTermsState({ ...termsState, tax_rate: e.target.value })}
                                            className="fp-input"
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>

                                <div className="fp-form-row-3">
                                    <div className="fp-form-field">
                                        <label className="fp-field-label">
                                            Sales Tax Basis
                                        </label>
                                        <select
                                            disabled={isFrozen}
                                            value={termsState.sales_tax_basis}
                                            onChange={(e) => setTermsState({ ...termsState, sales_tax_basis: e.target.value as any })}
                                            className="fp-select"
                                        >
                                            <option value="TOTAL_SALE">Total Monthly Sale × %</option>
                                            <option value="SERVICE_CHARGES">Total Count × Service Charges × %</option>
                                            <option value="MANUAL">Manual Entry (PKR)</option>
                                        </select>
                                        {termsState.sales_tax_basis === 'MANUAL' && (
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                disabled={isFrozen}
                                                value={termsState.sales_tax_override}
                                                onChange={(e) => setTermsState({ ...termsState, sales_tax_override: e.target.value })}
                                                className="fp-input"
                                                style={{ fontFamily: 'monospace', marginTop: '6px', borderColor: '#f59e0b', color: '#f59e0b', fontWeight: 600 }}
                                                placeholder="Sales Tax Override (PKR)"
                                                title="Manual Sales Tax override amount (PKR)"
                                            />
                                        )}
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">
                                            Withholding Tax Rate (%)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            disabled={isFrozen || termsState.withholding_tax_basis === 'MANUAL'}
                                            value={termsState.withholding_tax_rate}
                                            onChange={(e) => setTermsState({ ...termsState, withholding_tax_rate: e.target.value })}
                                            className="fp-input"
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">
                                            WHT Basis
                                        </label>
                                        <select
                                            disabled={isFrozen}
                                            value={termsState.withholding_tax_basis}
                                            onChange={(e) => setTermsState({ ...termsState, withholding_tax_basis: e.target.value as any })}
                                            className="fp-select"
                                        >
                                            <option value="INVOICE_AMOUNT">Invoice Amount × %</option>
                                            <option value="SERVICE_CHARGES">Total Count × Service Charges × %</option>
                                            <option value="MANUAL">Manual Entry (PKR)</option>
                                        </select>
                                        {termsState.withholding_tax_basis === 'MANUAL' && (
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                disabled={isFrozen}
                                                value={termsState.withholding_tax_override}
                                                onChange={(e) => setTermsState({ ...termsState, withholding_tax_override: e.target.value })}
                                                className="fp-input"
                                                style={{ fontFamily: 'monospace', marginTop: '6px', borderColor: '#a855f7', color: 'var(--color-text)', fontWeight: 600 }}
                                                placeholder="WHT Override (PKR)"
                                                title="Manual Withholding Tax override amount (PKR)"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Subpanel 3: Statutory Compliance & Additional Charges (EOBI, SESSI, Admin, Insurance) */}
                            <div className="fp-terms-panel">
                                <div className="fp-terms-panel-header">
                                    <div className="fp-terms-panel-title">
                                        <i className='bx bx-slider-alt' style={{ color: '#7c3aed', fontSize: '16px' }}></i>
                                        <span>Statutory Compliance & Additional Charges</span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Switchable Costing Items</span>
                                </div>

                                <div className="fp-terms-statutory-grid">
                                    {/* EOBI Card */}
                                    <div
                                        className="fp-statutory-card"
                                        style={{
                                            background: termsState.eobi_enabled ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-surface)',
                                            borderColor: termsState.eobi_enabled ? '#10b981' : 'var(--color-border)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className='bx bx-shield-quarter' style={{ color: termsState.eobi_enabled ? '#10b981' : 'var(--color-text-muted)', fontSize: '16px' }}></i>
                                                <strong style={{ fontSize: '12.5px', color: 'var(--color-text)' }}>EOBI (Statutory)</strong>
                                            </div>
                                            <ToggleSwitch
                                                checked={termsState.eobi_enabled}
                                                onChange={(val) => !isFrozen && setTermsState(prev => ({ ...prev, eobi_enabled: val }))}
                                                disabled={isFrozen}
                                                title="Toggle EOBI for this location proposal"
                                            />
                                        </div>
                                        {termsState.eobi_enabled ? (
                                            <div style={{ marginTop: '8px' }}>
                                                <div style={{ fontSize: '17px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
                                                    PKR {Math.round(liveCosting.eobi).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                                                    PKR {termsState.eobi_rate}/guard × {liveCosting.totalStrength} guards (Applied)
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                Disabled (Not Applied to this site)
                                            </div>
                                        )}
                                    </div>

                                    {/* SESSI Card */}
                                    <div
                                        className="fp-statutory-card"
                                        style={{
                                            background: termsState.sessi_enabled ? 'rgba(59, 130, 246, 0.06)' : 'var(--color-surface)',
                                            borderColor: termsState.sessi_enabled ? '#3b82f6' : 'var(--color-border)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className='bx bx-check-shield' style={{ color: termsState.sessi_enabled ? '#3b82f6' : 'var(--color-text-muted)', fontSize: '16px' }}></i>
                                                <strong style={{ fontSize: '12.5px', color: 'var(--color-text)' }}>SESSI / PESSI</strong>
                                            </div>
                                            <ToggleSwitch
                                                checked={termsState.sessi_enabled}
                                                onChange={(val) => !isFrozen && setTermsState(prev => ({ ...prev, sessi_enabled: val }))}
                                                disabled={isFrozen}
                                                title="Toggle SESSI/PESSI for this location proposal"
                                            />
                                        </div>
                                        {termsState.sessi_enabled ? (
                                            <div style={{ marginTop: '8px' }}>
                                                <div style={{ fontSize: '17px', fontWeight: 800, color: '#3b82f6', fontFamily: 'monospace' }}>
                                                    PKR {Math.round(liveCosting.sessi).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                                                    {termsState.sessi_percentage}% of Wage (PKR {Math.round(liveCosting.sessiRate)}/guard) × {liveCosting.totalStrength} guards
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                Disabled (Not Applied to this site)
                                            </div>
                                        )}
                                    </div>

                                    {/* Admin Charges Card */}
                                    <div
                                        className="fp-statutory-card"
                                        style={{
                                            background: termsState.admin_charges_enabled ? 'rgba(168, 85, 247, 0.06)' : 'var(--color-surface)',
                                            borderColor: termsState.admin_charges_enabled ? '#a855f7' : 'var(--color-border)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className='bx bx-briefcase' style={{ color: termsState.admin_charges_enabled ? '#a855f7' : 'var(--color-text-muted)', fontSize: '16px' }}></i>
                                                <strong style={{ fontSize: '12.5px', color: 'var(--color-text)' }}>Admin Charges</strong>
                                            </div>
                                            <ToggleSwitch
                                                checked={termsState.admin_charges_enabled}
                                                onChange={(val) => !isFrozen && setTermsState(prev => ({ ...prev, admin_charges_enabled: val }))}
                                                disabled={isFrozen}
                                                title="Toggle Admin Charges"
                                            />
                                        </div>
                                        {termsState.admin_charges_enabled ? (
                                            <div style={{ marginTop: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                    <span style={{ fontSize: '17px', fontWeight: 800, color: '#a855f7', fontFamily: 'monospace' }}>
                                                        {termsState.admin_charges_percentage}%
                                                    </span>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)' }}>
                                                        (PKR {Math.round(liveCosting.adminCharges).toLocaleString()})
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                                                    {termsState.admin_charges_percentage}% of Total Monthly Sale
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                Disabled (Not Applied to this site)
                                            </div>
                                        )}
                                    </div>

                                    {/* Insurance Card */}
                                    <div
                                        className="fp-statutory-card"
                                        style={{
                                            background: termsState.insurance_enabled ? 'rgba(245, 158, 11, 0.06)' : 'var(--color-surface)',
                                            borderColor: termsState.insurance_enabled ? '#f59e0b' : 'var(--color-border)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className='bx bx-heart' style={{ color: termsState.insurance_enabled ? '#f59e0b' : 'var(--color-text-muted)', fontSize: '16px' }}></i>
                                                <strong style={{ fontSize: '12.5px', color: 'var(--color-text)' }}>Insurance</strong>
                                            </div>
                                            <ToggleSwitch
                                                checked={termsState.insurance_enabled}
                                                onChange={(val) => !isFrozen && setTermsState(prev => ({ ...prev, insurance_enabled: val }))}
                                                disabled={isFrozen}
                                                title="Toggle Insurance"
                                            />
                                        </div>
                                        {termsState.insurance_enabled ? (
                                            <div style={{ marginTop: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                    <span style={{ fontSize: '17px', fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>
                                                        {termsState.insurance_percentage}%
                                                    </span>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)' }}>
                                                        (PKR {Math.round(liveCosting.insurance).toLocaleString()})
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                                                    {termsState.insurance_percentage}% of Total Monthly Sale
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                Disabled (Not Applied to this site)
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Subpanel 4: Commercial Notes & Contract Clauses */}
                            <div className="fp-terms-panel">
                                <div className="fp-terms-panel-header">
                                    <div className="fp-terms-panel-title">
                                        <i className='bx bx-file-blank' style={{ color: '#d97706', fontSize: '16px' }}></i>
                                        <span>Commercial Notes & Contract Clauses</span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Legal & Commercial Terms</span>
                                </div>

                                <div className="fp-form-row-2">
                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Commercial Notes</label>
                                        <textarea
                                            disabled={isFrozen}
                                            value={termsState.commercial_notes}
                                            onChange={(e) => setTermsState({ ...termsState, commercial_notes: e.target.value })}
                                            rows={3}
                                            placeholder="Commercial pricing assumptions, fuel escalation clauses, etc."
                                            className="fp-textarea"
                                        />
                                    </div>

                                    <div className="fp-form-field">
                                        <label className="fp-field-label">Terms & Conditions</label>
                                        <textarea
                                            disabled={isFrozen}
                                            value={termsState.terms_and_conditions}
                                            onChange={(e) => setTermsState({ ...termsState, terms_and_conditions: e.target.value })}
                                            rows={3}
                                            placeholder="Termination notice, indemnity, equipment maintenance terms."
                                            className="fp-textarea"
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Right Side: Commercial Summary & Costing Engine Sticky Sidebar */}
                <div className="fp-right-sidebar">
                    {/* Costing Engine Card */}
                    <div className="fp-costing-card">
                        <div className="fp-costing-header">
                            <div className="fp-costing-title-group">
                                <i className='bx bx-calculator' style={{ fontSize: '18px', color: '#38bdf8' }}></i>
                                <h3 className="fp-costing-title">Security Costing</h3>
                            </div>
                            <span className="fp-costing-engine-badge">Standard Costing</span>
                        </div>

                        {/* Section: Operational Volume & Salaries */}
                        <div className="fp-costing-section">
                            <div className="fp-costing-sec-title">Strength & Direct Pay</div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Contract Strength</span>
                                </div>
                                <span className="val-col" style={{ color: '#38bdf8' }}>
                                    {liveCosting.totalStrength} Guards
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Total Monthly Sale</span>
                                </div>
                                <span className="val-col">
                                    PKR {Number(liveCosting.monthlySale).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Total Guard Salary</span>
                                </div>
                                <span className="val-col" style={{ color: '#fb923c' }}>
                                    PKR {Number(liveCosting.monthlySalary).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Section: Operational Charges & Taxes */}
                        <div className="fp-costing-section" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                            <div className="fp-costing-sec-title">Overheads & Tax Compliance</div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Operations Overhead</span>
                                </div>
                                <span className="val-col">
                                    PKR {Number(liveCosting.totalExpense).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Service Charges</span>
                                </div>
                                <span className="val-col">
                                    PKR {Number(liveCosting.totalServiceCharges).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Sales Tax ({liveCosting.salesTaxRate}%)</span>
                                </div>
                                <span className="val-col" style={{ color: '#f59e0b' }}>
                                    PKR {Number(liveCosting.salesTax).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Total Invoice Amount</span>
                                </div>
                                <span className="val-col" style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                                    PKR {Number(liveCosting.invoiceAmount).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Tax WHT ({liveCosting.taxWhtRate}%)</span>
                                </div>
                                <span className="val-col" style={{ color: '#ef4444' }}>
                                    PKR {Number(liveCosting.wht).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>EOBI</span>
                                </div>
                                <span className="val-col" style={{ color: termsState.eobi_enabled ? '#10b981' : 'var(--color-text-muted)' }}>
                                    {termsState.eobi_enabled ? `PKR ${Number(liveCosting.eobi).toLocaleString()}` : 'Disabled'}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>SESSI/PESSI</span>
                                </div>
                                <span className="val-col" style={{ color: termsState.sessi_enabled ? '#3b82f6' : 'var(--color-text-muted)' }}>
                                    {termsState.sessi_enabled ? `PKR ${Number(liveCosting.sessi).toLocaleString()}` : 'Disabled'}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Admin Charges</span>
                                </div>
                                <span className="val-col" style={{ color: termsState.admin_charges_enabled ? '#a855f7' : 'var(--color-text-muted)' }}>
                                    {termsState.admin_charges_enabled ? `PKR ${Number(liveCosting.adminCharges).toLocaleString()} (${termsState.admin_charges_percentage}%)` : 'Disabled'}
                                </span>
                            </div>
                            <div className="fp-costing-line">
                                <div className="label-col">
                                    <span>Insurance</span>
                                </div>
                                <span className="val-col" style={{ color: termsState.insurance_enabled ? '#f59e0b' : 'var(--color-text-muted)' }}>
                                    {termsState.insurance_enabled ? `PKR ${Number(liveCosting.insurance).toLocaleString()} (${termsState.insurance_percentage}%)` : 'Disabled'}
                                </span>
                            </div>
                        </div>

                        {/* Section: Profitability & Margins */}
                        <div className="fp-costing-section" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                            <div className="fp-costing-sec-title">Bottom Line & Margins</div>

                            <div className="fp-costing-box-margin">
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Gross Margin</div>
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                    PKR {Number(liveCosting.difference).toLocaleString()}
                                </div>
                            </div>

                            <div className="fp-costing-line" style={{ padding: '0 4px' }}>
                                <div className="label-col">
                                    <span>Margin Per Head</span>
                                </div>
                                <span className="val-col" style={{ color: '#818cf8', fontWeight: 700 }}>
                                    PKR {Number(liveCosting.diffPerHead).toLocaleString()} / guard
                                </span>
                            </div>

                            <div className={`fp-costing-box-profit ${Number(liveCosting.profitLoss) >= 0 ? 'profit' : 'loss'}`}>
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Net Profit / Loss</div>
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'monospace' }}>
                                    PKR {Number(liveCosting.profitLoss).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="fp-summary-card">
                        <div className="fp-summary-header">
                            <div className="fp-summary-title-group">
                                <i className='bx bx-calculator' style={{ fontSize: '20px', color: '#818cf8' }}></i>
                                <h3 className="fp-summary-title">Commercial Summary</h3>
                            </div>
                            <span className="fp-version-count-badge">
                                v{activeVersion?.version_number || 1}
                            </span>
                        </div>

                        {/* Monthly Recurring Schedule */}
                        <div className="fp-summary-section">
                            <div className="fp-summary-sec-header recurring">
                                <span>Monthly Recurring</span>
                                <span>Schedule</span>
                            </div>
                            <div className="fp-summary-line">
                                <span>Guard Services:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.monthly_services_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>Recurring Equipment:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.recurring_equipment_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>Recurring Charges:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.recurring_charges_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line total" style={{ color: '#818cf8' }}>
                                <span>Total Monthly Recurring:</span>
                                <span style={{ fontFamily: 'monospace' }}>
                                    PKR {Number(activeVersion?.total_monthly_recurring || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* One-Time Schedule */}
                        <div className="fp-summary-section">
                            <div className="fp-summary-sec-header onetime">
                                <span>One-Time Charges</span>
                                <span>Schedule</span>
                            </div>
                            <div className="fp-summary-line">
                                <span>One-Time Services:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.one_time_services_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>One-Time Equipment:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.one_time_equipment_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>One-Time Charges:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.one_time_charges_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line total" style={{ color: '#34d399' }}>
                                <span>Total One-Time:</span>
                                <span style={{ fontFamily: 'monospace' }}>
                                    PKR {Number(activeVersion?.total_one_time || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Discount controls in Summary */}
                        {!isFrozen && (
                            <div className="fp-summary-discount-box">
                                <div className="fp-summary-discount-title">Commercial Discount</div>
                                <div className="fp-discount-grid">
                                    <div className="fp-form-field">
                                        <label className="fp-field-label" style={{ fontSize: '10px' }}>Type</label>
                                        <select
                                            value={termsState.discount_type}
                                            onChange={(e) => setTermsState({ ...termsState, discount_type: e.target.value as any })}
                                            className="fp-select"
                                            style={{ padding: '6px 8px', fontSize: '12px' }}
                                        >
                                            <option value="NONE">None</option>
                                            <option value="FIXED">Fixed (PKR)</option>
                                            <option value="PERCENTAGE">Percentage (%)</option>
                                        </select>
                                    </div>
                                    <div className="fp-form-field">
                                        <label className="fp-field-label" style={{ fontSize: '10px' }}>Value</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={termsState.discount_value}
                                            onChange={(e) => setTermsState({ ...termsState, discount_value: e.target.value })}
                                            className="fp-input"
                                            style={{ padding: '6px 8px', fontSize: '12px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Totals Breakdown */}
                        <div className="fp-summary-totals-group">
                            <div className="fp-summary-line">
                                <span>Total Monthly Sale:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.subtotal || 0).toLocaleString()}
                                </span>
                            </div>
                            {Number(activeVersion?.discount_amount || 0) > 0 && (
                                <div className="fp-summary-line" style={{ color: '#ef4444' }}>
                                    <span>Discount Applied:</span>
                                    <span style={{ fontFamily: 'monospace' }}>
                                        - PKR {Number(activeVersion?.discount_amount || 0).toLocaleString()}
                                    </span>
                                </div>
                            )}

                            {/* Grand Total Highlight Box */}
                            <div className="fp-grand-total-box">
                                <div>
                                    <div className="fp-grand-total-label">Total Invoice Amount</div>
                                    <div className="fp-grand-total-sub">Total commercial proposal offer</div>
                                </div>
                                <div className="fp-grand-total-amount">
                                    PKR {Number(liveCosting.invoiceAmount || activeVersion?.total_invoice_amount || 0).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Send Final Proposal Action Button */}
                        {isFinalStage && !isFrozen && (
                            <button
                                onClick={handleOpenEmailComposer}
                                className="fp-btn-send-main"
                                style={{ width: '100%', justifyContent: 'center', padding: '12px 18px', fontSize: '13.5px' }}
                            >
                                <i className='bx bx-mail-send'></i> Send Final Proposal Offer
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ImportRecommendationsModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                assessments={assessments}
                onImport={handleImportRecommendations}
            />

            {activeVersion && (
                <>
                    <AddServiceLineModal
                        isOpen={showServiceModal}
                        onClose={() => {
                            setShowServiceModal(false);
                            setEditingServiceLine(null);
                        }}
                        proposalVersionId={activeVersion.id}
                        locations={locations}
                        serviceTypes={serviceTypes}
                        editingLine={editingServiceLine}
                        onSave={handleSaveServiceLine}
                    />

                    <AddEquipmentRequirementModal
                        isOpen={showEquipmentModal}
                        onClose={() => {
                            setShowEquipmentModal(false);
                            setEditingEquipment(null);
                        }}
                        proposalVersionId={activeVersion.id}
                        locations={locations}
                        editingEquipment={editingEquipment}
                        onSave={handleSaveEquipment}
                    />

                    <AddAdditionalChargeModal
                        isOpen={showChargeModal}
                        onClose={() => {
                            setShowChargeModal(false);
                            setEditingCharge(null);
                        }}
                        proposalVersionId={activeVersion.id}
                        editingCharge={editingCharge}
                        onSave={handleSaveCharge}
                    />

                    <TemporaryServiceModal
                        isOpen={showTempServiceModal}
                        onClose={() => {
                            setShowTempServiceModal(false);
                            setEditingTempService(null);
                        }}
                        onSaved={async () => {
                            await loadTempServices();
                            useToastStore.getState().success('Temporary security service saved and synced to Operations!');
                        }}
                        service={editingTempService}
                        preselectedCrmEntityId={customerId || undefined}
                        preselectedCrmEntityName={customerName || undefined}
                        preselectedSiteId={locationId || undefined}
                        preselectedSiteName={locationName || undefined}
                        initialScenario="existing_site"
                    />
                </>
            )}
        </div>
    );
};
