import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    getVendor, getVendorContacts, getVendorItems, getVendorDocuments, getPurchaseOrders,
    deleteVendorContact, deleteVendorItem, deleteVendorDocument, getVendorInvoices,
    getVendorPayableSummary,
    type Vendor, type VendorContact, type VendorItem, type VendorDocument, type PurchaseOrder,
    type VendorInvoice, type VendorPayableSummary 
} from '../api';
import { VendorModal } from './VendorModal';
import { VendorContactModal } from './VendorContactModal';
import { VendorItemModal } from './VendorItemModal';
import { VendorDocumentModal } from './VendorDocumentModal';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import { GoodsReceiptList } from './GoodsReceiptList';
import { VendorInvoiceDetailModal } from './VendorInvoiceDetailModal';
import { VendorPaymentsTab } from './VendorPaymentsTab';
import { VendorPaymentModal } from './VendorPaymentModal';
import { VendorReturnsTab } from './VendorReturnsTab';
import { VendorStatementTab } from './VendorStatementTab';

interface VendorWorkspaceProps {
    vendorId: string;
    onBack: () => void;
    onSelectPo?: (poId: string) => void;
}



export const VendorWorkspace: React.FC<VendorWorkspaceProps> = ({ vendorId, onBack, onSelectPo }) => {
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [activeTab, setActiveTab] = useState<
        'overview' | 'contacts' | 'items' | 'documents' | 
        'orders' | 'receipts' | 'bills' | 'payments' | 'returns' | 'statement'
    >('overview');
    const [loading, setLoading] = useState(true);

    // Tab Data
    const [contacts, setContacts] = useState<VendorContact[]>([]);
    const [items, setItems] = useState<VendorItem[]>([]);
    const [documents, setDocuments] = useState<VendorDocument[]>([]);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [bills, setBills] = useState<VendorInvoice[]>([]);
    const [payableSummary, setPayableSummary] = useState<VendorPayableSummary | null>(null);

    // Modals
    const [showEditVendorModal, setShowEditVendorModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [selectedContact, setSelectedContact] = useState<VendorContact | null>(null);

    const [showItemModal, setShowItemModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState<VendorItem | null>(null);

    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [showCreatePoModal, setShowCreatePoModal] = useState(false);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<string | null>(null);

    useEffect(() => {
        loadVendorData();
    }, [vendorId]);

    const loadVendorData = async () => {
        setLoading(true);
        try {
            const vData = await getVendor(vendorId);
            setVendor(vData);

            // Load sub-data
            const [cData, iData, dData, oData, bData, pSummary] = await Promise.all([
                getVendorContacts(vendorId).catch(() => []),
                getVendorItems(vendorId).catch(() => []),
                getVendorDocuments(vendorId).catch(() => []),
                getPurchaseOrders({ vendor: vendorId }).catch(() => []),
                getVendorInvoices({ vendor: vendorId }).catch(() => []),
                getVendorPayableSummary(vendorId).catch(() => null)
            ]);
            setContacts(cData);
            setItems(iData);
            setDocuments(dData);
            setOrders(oData);
            setBills(bData);
            setPayableSummary(pSummary);
        } catch (err: any) {
            useToastStore.getState().error('Failed to load vendor details.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteContact = async (contactId: string, name: string) => {
        if (!window.confirm(`Delete contact "${name}"?`)) return;
        try {
            await deleteVendorContact(contactId);
            useToastStore.getState().success('Contact deleted.');
            const cData = await getVendorContacts(vendorId);
            setContacts(cData);
        } catch {
            useToastStore.getState().error('Failed to delete contact.');
        }
    };

    const handleDeleteItem = async (itemId: string, name: string) => {
        if (!window.confirm(`Remove "${name}" from vendor catalogue?`)) return;
        try {
            await deleteVendorItem(itemId);
            useToastStore.getState().success('Item removed from catalogue.');
            const iData = await getVendorItems(vendorId);
            setItems(iData);
        } catch {
            useToastStore.getState().error('Failed to delete vendor item.');
        }
    };

    const handleDeleteDocument = async (docId: string, title: string) => {
        if (!window.confirm(`Delete document "${title}"?`)) return;
        try {
            await deleteVendorDocument(docId);
            useToastStore.getState().success('Document deleted.');
            const dData = await getVendorDocuments(vendorId);
            setDocuments(dData);
        } catch {
            useToastStore.getState().error('Failed to delete document.');
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                <div>Loading Vendor Workspace...</div>
            </div>
        );
    }

    if (!vendor) {
        return (
            <div style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ color: '#ef4444', marginBottom: '12px' }}>Vendor not found or deleted.</div>
                <Button variant="secondary" onClick={onBack}>Back to Vendors</Button>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: 'bx-home-alt' },
        { id: 'contacts', label: `Contacts (${contacts.length})`, icon: 'bx-user-pin' },
        { id: 'items', label: `Items & Pricing (${items.length})`, icon: 'bx-package' },
        { id: 'documents', label: `Documents (${documents.length})`, icon: 'bx-file' },
        { id: 'orders', label: 'Purchase Orders', icon: 'bx-cart' },
        { id: 'receipts', label: 'Receipts (GRN)', icon: 'bx-box' },
        { id: 'bills', label: 'Bills / Invoices', icon: 'bx-receipt' },
        { id: 'payments', label: 'Payments', icon: 'bx-credit-card' },
        { id: 'returns', label: 'Returns', icon: 'bx-undo' },
        { id: 'statement', label: 'Statement', icon: 'bx-spreadsheet' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Top Bar / Breadcrumb */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <i className='bx bx-arrow-back'></i> Back to Vendors
                    </Button>
                    <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                        {vendor.code}
                    </span>
                    <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text)' }}>
                        {vendor.name}
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" size="sm" onClick={() => setShowEditVendorModal(true)}>
                        <i className='bx bx-edit'></i> Edit Profile
                    </Button>
                </div>
            </div>

            {/* Vendor Header Card */}
            <Card style={{ padding: '20px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ 
                            width: '54px', height: '54px', borderRadius: '12px', 
                            background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary, #6366f1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px'
                        }}>
                            <i className='bx bx-buildings'></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>{vendor.name}</h2>
                                <span style={{ 
                                    fontSize: '11px', padding: '2px 8px', borderRadius: '6px', 
                                    background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', 
                                    fontWeight: 700, color: 'var(--color-text-muted)' 
                                }}>
                                    {vendor.code}
                                </span>
                                <span style={{ 
                                    fontSize: '11px', padding: '2px 8px', borderRadius: '6px', 
                                    background: vendor.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: vendor.status === 'ACTIVE' ? '#10b981' : '#ef4444',
                                    border: `1px solid ${vendor.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                    fontWeight: 700
                                }}>
                                    {vendor.status}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '13px', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                                {vendor.category_name && (
                                    <span><i className='bx bx-category'></i> {vendor.category_name}</span>
                                )}
                                {vendor.contact_person && (
                                    <span><i className='bx bx-user'></i> {vendor.contact_person}</span>
                                )}
                                {vendor.phone && (
                                    <span><i className='bx bx-phone'></i> {vendor.phone}</span>
                                )}
                                {vendor.email && (
                                    <span><i className='bx bx-envelope'></i> {vendor.email}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Payment Terms
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}>
                                {vendor.payment_terms || 'Net 30'}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Credit Limit
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981' }}>
                                PKR {Number(vendor.credit_limit || 0).toLocaleString()}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Supplied Items
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)' }}>
                                {items.length}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Workspace Tab Bar */}
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--color-border)', overflowX: 'auto', paddingBottom: '2px' }}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id as any)}
                        style={{
                            padding: '10px 16px',
                            background: activeTab === t.id ? 'var(--color-surface-secondary)' : 'transparent',
                            border: '1px solid',
                            borderColor: activeTab === t.id ? 'var(--color-border)' : 'transparent',
                            borderBottom: activeTab === t.id ? '2px solid var(--color-primary)' : '1px solid transparent',
                            borderRadius: '8px 8px 0 0',
                            color: activeTab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: activeTab === t.id ? 700 : 500,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <i className={`bx ${t.icon}`}></i>
                        <span>{t.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Contents */}
            <div>
                {/* 1. Overview Tab */}
                {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Live Accounts Payable & Commercial Summary Banner */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                            <Card style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--color-surface, #1e293b)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className='bx bx-cart-alt' style={{ color: '#38bdf8' }}></i> Total Purchases
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: '6px' }}>
                                    PKR {Number(payableSummary?.total_purchases || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    {payableSummary?.total_posted_invoices_count || 0} posted bill(s)
                                </div>
                            </Card>

                            <Card style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--color-surface, #1e293b)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className='bx bx-check-circle' style={{ color: '#10b981' }}></i> Total Paid
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>
                                    PKR {Number(payableSummary?.total_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    {payableSummary?.total_payments_count || 0} payment voucher(s)
                                </div>
                            </Card>

                            <Card style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--color-surface, #1e293b)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className='bx bx-time-five' style={{ color: '#f59e0b' }}></i> Outstanding Payable
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginTop: '6px' }}>
                                    PKR {Number(payableSummary?.outstanding_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    {payableSummary?.unpaid_invoices_count || 0} open bill(s)
                                </div>
                            </Card>

                            <Card style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--color-surface, #1e293b)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className='bx bx-alarm-exclamation' style={{ color: '#ef4444' }}></i> Overdue Payable
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f87171', marginTop: '6px' }}>
                                    PKR {Number(payableSummary?.overdue_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    {payableSummary?.overdue_invoices_count || 0} overdue bill(s)
                                </div>
                            </Card>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                            {/* Company & Contact Details */}
                            <Card style={{ padding: '18px', borderRadius: '12px' }}>
                                <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className='bx bx-detail' style={{ color: 'var(--color-primary)' }}></i> Vendor Information
                                </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Vendor Code:</span>
                                    <strong>{vendor.code}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Category:</span>
                                    <span>{vendor.category_name || 'General Supplier'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Primary Contact:</span>
                                    <span>{vendor.contact_person || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Phone:</span>
                                    <span>{vendor.phone || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Email:</span>
                                    <span>{vendor.email || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Website:</span>
                                    <span>{vendor.website ? <a href={vendor.website} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>{vendor.website}</a> : 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Address:</span>
                                    <span style={{ maxWidth: '200px', textAlign: 'right' }}>{vendor.address || 'N/A'}</span>
                                </div>
                            </div>
                        </Card>

                        {/* Commercial & Tax */}
                        <Card style={{ padding: '18px', borderRadius: '12px' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-calculator' style={{ color: 'var(--color-primary)' }}></i> Commercial & Tax Terms
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Payment Terms:</span>
                                    <strong>{vendor.payment_terms || 'Net 30'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Credit Limit:</span>
                                    <strong style={{ color: '#10b981' }}>PKR {Number(vendor.credit_limit || 0).toLocaleString()}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Tax NTN / VAT:</span>
                                    <span>{vendor.tax_number || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Registration / SECP:</span>
                                    <span>{vendor.registration_number || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Vendor Rating:</span>
                                    <span>{'⭐'.repeat(vendor.rating || 5)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Created At:</span>
                                    <span>{new Date(vendor.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </Card>

                        {/* Bank Settlement Details */}
                        <Card style={{ padding: '18px', borderRadius: '12px' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-credit-card' style={{ color: 'var(--color-primary)' }}></i> Bank Settlement
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Bank Name:</span>
                                    <strong>{vendor.bank_name || 'N/A'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Account Title:</span>
                                    <span>{vendor.account_title || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Account No:</span>
                                    <span>{vendor.account_number || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>IBAN:</span>
                                    <span style={{ fontFamily: 'monospace' }}>{vendor.iban || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>SWIFT:</span>
                                    <span>{vendor.swift_code || 'N/A'}</span>
                                </div>
                            </div>
                        </Card>
                    </div>
                    </div>
                )}

                {/* 2. Contacts Tab */}
                {activeTab === 'contacts' && (
                    <Card style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Vendor Representatives & Contacts</h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Manage multiple point-of-contacts, dispatch heads, and sales account managers.
                                </p>
                            </div>
                            <Button 
                                variant="primary" 
                                size="sm" 
                                onClick={() => { setSelectedContact(null); setShowContactModal(true); }}
                            >
                                <i className='bx bx-plus'></i> Add Contact
                            </Button>
                        </div>

                        {contacts.length === 0 ? (
                            <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '10px', background: 'var(--color-surface-secondary)' }}>
                                <i className='bx bx-user-plus' style={{ fontSize: '32px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>No Contacts Listed</div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                                    Add primary and department contacts for this supplier.
                                </div>
                                <Button size="sm" variant="primary" onClick={() => { setSelectedContact(null); setShowContactModal(true); }}>
                                    + Add Contact
                                </Button>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                            <th style={{ padding: '10px' }}>Name</th>
                                            <th style={{ padding: '10px' }}>Designation</th>
                                            <th style={{ padding: '10px' }}>Department</th>
                                            <th style={{ padding: '10px' }}>Phone</th>
                                            <th style={{ padding: '10px' }}>Email</th>
                                            <th style={{ padding: '10px' }}>Status</th>
                                            <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contacts.map(c => (
                                            <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '12px 10px', fontWeight: 600 }}>
                                                    {c.first_name} {c.last_name}
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>{c.job_title || '—'}</td>
                                                <td style={{ padding: '12px 10px' }}>{c.department || '—'}</td>
                                                <td style={{ padding: '12px 10px' }}>{c.phone || c.mobile || '—'}</td>
                                                <td style={{ padding: '12px 10px' }}>{c.email || '—'}</td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    {c.is_primary ? (
                                                        <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '11px', fontWeight: 700 }}>
                                                            PRIMARY
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Standard</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => { setSelectedContact(c); setShowContactModal(true); }}
                                                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                                        >
                                                            <i className='bx bx-edit'></i>
                                                        </button>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => handleDeleteContact(c.id, `${c.first_name} ${c.last_name}`)}
                                                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                                                        >
                                                            <i className='bx bx-trash'></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                )}

                {/* 3. Items & Pricing Tab */}
                {activeTab === 'items' && (
                    <Card style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Vendor Item Catalogue & Quoted Pricing</h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Inventory items supplied by this vendor with negotiated unit prices, lead times, and MOQ.
                                </p>
                            </div>
                            <Button 
                                variant="primary" 
                                size="sm" 
                                onClick={() => { setSelectedItem(null); setShowItemModal(true); }}
                            >
                                <i className='bx bx-plus'></i> Add Item to Catalogue
                            </Button>
                        </div>

                        {items.length === 0 ? (
                            <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '10px', background: 'var(--color-surface-secondary)' }}>
                                <i className='bx bx-box' style={{ fontSize: '32px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>No Items in Vendor Catalogue</div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                                    Map inventory items (uniforms, walkie talkies, CCTV, tactical gear) to this vendor.
                                </div>
                                <Button size="sm" variant="primary" onClick={() => { setSelectedItem(null); setShowItemModal(true); }}>
                                    + Map First Item
                                </Button>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                            <th style={{ padding: '10px' }}>Inventory Item</th>
                                            <th style={{ padding: '10px' }}>Vendor SKU</th>
                                            <th style={{ padding: '10px', textAlign: 'right' }}>Vendor Price</th>
                                            <th style={{ padding: '10px', textAlign: 'right' }}>MOQ</th>
                                            <th style={{ padding: '10px', textAlign: 'right' }}>Lead Time</th>
                                            <th style={{ padding: '10px' }}>Preferred</th>
                                            <th style={{ padding: '10px' }}>Status</th>
                                            <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '12px 10px' }}>
                                                    <div style={{ fontWeight: 600 }}>{item.item_name || 'Inventory Item'}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        SKU: {item.item_sku || 'N/A'} {item.item_brand ? `• ${item.item_brand}` : ''}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 10px', fontFamily: 'monospace' }}>{item.vendor_sku || '—'}</td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                                                    {item.currency} {Number(item.vendor_price).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                    {item.minimum_order_quantity} {item.item_unit_of_measure || 'pcs'}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                    {item.lead_time_days ? `${item.lead_time_days} days` : 'Immediate'}
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    {item.is_preferred ? (
                                                        <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '11px', fontWeight: 700 }}>
                                                            PREFERRED
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Secondary</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    <span style={{ color: item.is_active ? '#10b981' : '#ef4444', fontSize: '12px', fontWeight: 600 }}>
                                                        {item.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => { setSelectedItem(item); setShowItemModal(true); }}
                                                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                                        >
                                                            <i className='bx bx-edit'></i>
                                                        </button>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => handleDeleteItem(item.id, item.item_name || 'item')}
                                                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                                                        >
                                                            <i className='bx bx-trash'></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                )}

                {/* 4. Documents Tab */}
                {activeTab === 'documents' && (
                    <Card style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Vendor Compliance Documents & Contracts</h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Agreements, NTN certificates, bank letters, warranty terms, and price lists.
                                </p>
                            </div>
                            <Button 
                                variant="primary" 
                                size="sm" 
                                onClick={() => setShowDocumentModal(true)}
                            >
                                <i className='bx bx-upload'></i> Upload Document
                            </Button>
                        </div>

                        {documents.length === 0 ? (
                            <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '10px', background: 'var(--color-surface-secondary)' }}>
                                <i className='bx bx-file-blank' style={{ fontSize: '32px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>No Documents Uploaded</div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                                    Upload agreements, tax certificates, and quotation files.
                                </div>
                                <Button size="sm" variant="primary" onClick={() => setShowDocumentModal(true)}>
                                    + Upload Document
                                </Button>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                                {documents.map(doc => (
                                    <div 
                                        key={doc.id}
                                        style={{
                                            padding: '14px',
                                            borderRadius: '10px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            gap: '10px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                            <div style={{ 
                                                width: '38px', height: '38px', borderRadius: '8px', 
                                                background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0
                                            }}>
                                                <i className='bx bx-file'></i>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '13.5px', wordBreak: 'break-word' }}>
                                                    {doc.title}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                    {doc.document_type_display || doc.document_type}
                                                </div>
                                                {doc.notes && (
                                                    <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                                                        {doc.notes}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '10px', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--color-text-muted)' }}>
                                                {new Date(doc.created_at).toLocaleDateString()}
                                            </span>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {doc.file_url || doc.file ? (
                                                    <a 
                                                        href={doc.file_url || doc.file} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        style={{ 
                                                            padding: '4px 8px', borderRadius: '6px', 
                                                            background: 'var(--color-surface-secondary)', 
                                                            border: '1px solid var(--color-border)', 
                                                            color: 'var(--color-primary)', 
                                                            textDecoration: 'none', 
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px' 
                                                        }}
                                                    >
                                                        <i className='bx bx-download'></i> View
                                                    </a>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteDocument(doc.id, doc.title)}
                                                    style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--color-border)', color: '#ef4444', cursor: 'pointer' }}
                                                >
                                                    <i className='bx bx-trash'></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}

                {/* 5. Purchase Orders Tab (Phase S-3B Activated) */}
                {activeTab === 'orders' && (
                    <Card style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Vendor Purchase Orders</h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Purchase commitments, approvals, and order tracking for {vendor.name}.
                                </p>
                            </div>
                            <Button 
                                variant="primary" 
                                size="sm" 
                                onClick={() => setShowCreatePoModal(true)}
                            >
                                <i className='bx bx-plus'></i> Create PO for Vendor
                            </Button>
                        </div>

                        {orders.length === 0 ? (
                            <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '10px', background: 'var(--color-surface-secondary)' }}>
                                <i className='bx bx-cart' style={{ fontSize: '32px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>No Purchase Orders Found</div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                                    You have not created any purchase orders for this vendor yet.
                                </div>
                                <Button size="sm" variant="primary" onClick={() => setShowCreatePoModal(true)}>
                                    <i className='bx bx-plus'></i> Create First PO
                                </Button>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                            <th style={{ padding: '10px' }}>PO Number</th>
                                            <th style={{ padding: '10px' }}>Order Date</th>
                                            <th style={{ padding: '10px' }}>Expected Delivery</th>
                                            <th style={{ padding: '10px', textAlign: 'right' }}>Grand Total</th>
                                            <th style={{ padding: '10px' }}>Status</th>
                                            <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map(po => (
                                            <tr key={po.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '12px 10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <i className='bx bx-cart' style={{ color: 'var(--color-primary)' }}></i>
                                                        <strong style={{ color: 'var(--color-text)' }}>{po.number}</strong>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    {new Date(po.document_date).toLocaleDateString()}
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    {po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : '—'}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                                                    PKR {Number(po.total_amount || 0).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    <span style={{ 
                                                        fontSize: '11px', padding: '3px 8px', borderRadius: '6px', 
                                                        background: po.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : 'var(--color-surface-secondary)', 
                                                        color: po.status === 'APPROVED' ? '#10b981' : 'var(--color-text-muted)',
                                                        fontWeight: 700
                                                    }}>
                                                        {po.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                    {onSelectPo ? (
                                                        <Button 
                                                            variant="secondary" 
                                                            size="sm" 
                                                            onClick={() => onSelectPo(po.id)}
                                                        >
                                                            View PO
                                                        </Button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                )}

                {activeTab === 'receipts' && (
                    <GoodsReceiptList 
                        vendorIdFilter={vendor.id}
                        onSelectPO={onSelectPo}
                    />
                )}


                {activeTab === 'bills' && (
                    <Card style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                                    Vendor Invoices & Bills ({bills.length})
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Verified bills, 3-way match statuses, payable balances, and disbursement settlements.
                                </p>
                            </div>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setShowPaymentModal(true)}
                            >
                                <i className='bx bx-credit-card'></i> Record Payment
                            </Button>
                        </div>

                        {bills.length === 0 ? (
                            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                                <i className='bx bx-receipt' style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                                <div>No bills or invoices recorded for this vendor yet.</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                            <th style={{ padding: '10px 12px' }}>Invoice / Bill #</th>
                                            <th style={{ padding: '10px 12px' }}>Linked PO</th>
                                            <th style={{ padding: '10px 12px' }}>Date / Due</th>
                                            <th style={{ padding: '10px 12px' }}>3-Way Match</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Bill Total</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Paid</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Outstanding</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center' }}>Payment Status</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bills.map((b) => {
                                            const totalAmt = Number(b.total_amount || 0);
                                            const paidAmt = Number(b.paid_amount || 0);
                                            const outstandingAmt = b.outstanding_amount !== undefined ? Number(b.outstanding_amount) : Math.max(0, totalAmt - paidAmt);
                                            const isOverdue = Boolean(b.is_overdue);

                                            let pStatusBadge = { label: 'UNPAID', bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
                                            if (b.payment_status === 'PAID') {
                                                pStatusBadge = { label: 'PAID', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
                                            } else if (b.payment_status === 'PARTIALLY_PAID') {
                                                pStatusBadge = { label: 'PARTIALLY PAID', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
                                            } else if (b.payment_status === 'OVERDUE' || isOverdue) {
                                                pStatusBadge = { label: 'OVERDUE', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
                                            }

                                            return (
                                                <tr
                                                    key={b.id}
                                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                                    onClick={() => setSelectedInvoiceId(b.id)}
                                                >
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--color-primary, #6366f1)' }}>{b.number}</div>
                                                        <div style={{ fontSize: '11px', color: '#60a5fa' }}>Ref: {b.vendor_invoice_number || 'N/A'}</div>
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                            color: '#60a5fa',
                                                            border: '1px solid rgba(59, 130, 246, 0.2)'
                                                        }}>
                                                            {b.parent_document_number || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>
                                                        <div>{b.document_date}</div>
                                                        {b.due_date && (
                                                            <div style={{ fontSize: '11px', color: isOverdue && outstandingAmt > 0 ? '#f87171' : 'var(--color-text-muted)', fontWeight: isOverdue && outstandingAmt > 0 ? 700 : 400 }}>
                                                                Due: {b.due_date}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '3px 8px',
                                                            borderRadius: '12px',
                                                            fontWeight: 700,
                                                            backgroundColor: b.match_status === 'MATCHED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                            color: b.match_status === 'MATCHED' ? '#34d399' : '#f87171',
                                                            border: `1px solid ${b.match_status === 'MATCHED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                                        }}>
                                                            {b.match_status || 'PENDING'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#ffffff' }}>
                                                        {b.currency} {totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>
                                                        {b.currency} {paidAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: outstandingAmt > 0 ? '#f59e0b' : '#34d399' }}>
                                                        {b.currency} {outstandingAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '3px 8px',
                                                            borderRadius: '12px',
                                                            fontWeight: 700,
                                                            backgroundColor: pStatusBadge.bg,
                                                            color: pStatusBadge.text,
                                                            border: `1px solid ${pStatusBadge.border}`
                                                        }}>
                                                            {pStatusBadge.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedInvoiceId(b.id);
                                                                }}
                                                            >
                                                                Inspect
                                                            </Button>
                                                            {b.status === 'POSTED' && outstandingAmt > 0 && (
                                                                <Button
                                                                    variant="primary"
                                                                    size="sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedInvoiceForPayment(b.id);
                                                                    }}
                                                                >
                                                                    <i className='bx bx-credit-card'></i> Pay
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                )}


                {activeTab === 'payments' && (
                    <VendorPaymentsTab vendorId={vendorId} vendorName={vendor.name} />
                )}

                {activeTab === 'returns' && (
                    <VendorReturnsTab
                        vendorId={vendorId}
                        vendorName={vendor.name}
                    />
                )}

                {activeTab === 'statement' && (
                    <VendorStatementTab
                        vendorId={vendorId}
                        vendorName={vendor.name}
                    />
                )}
            </div>

            {/* Modals */}
            <VendorModal
                isOpen={showEditVendorModal}
                onClose={() => setShowEditVendorModal(false)}
                onSaved={(updated) => { setVendor(updated); loadVendorData(); }}
                vendor={vendor}
            />

            <VendorContactModal
                isOpen={showContactModal}
                onClose={() => setShowContactModal(false)}
                onSaved={async () => {
                    const cData = await getVendorContacts(vendorId);
                    setContacts(cData);
                }}
                vendorId={vendorId}
                contact={selectedContact}
            />

            <VendorItemModal
                isOpen={showItemModal}
                onClose={() => setShowItemModal(false)}
                onSaved={async () => {
                    const iData = await getVendorItems(vendorId);
                    setItems(iData);
                }}
                vendorId={vendorId}
                vendorItem={selectedItem}
            />

            <VendorDocumentModal
                isOpen={showDocumentModal}
                onClose={() => setShowDocumentModal(false)}
                onSaved={async () => {
                    const dData = await getVendorDocuments(vendorId);
                    setDocuments(dData);
                }}
                vendorId={vendorId}
            />

            <PurchaseOrderModal
                isOpen={showCreatePoModal}
                onClose={() => setShowCreatePoModal(false)}
                defaultVendorId={vendorId}
                onSaved={async (newPo) => {
                    const oData = await getPurchaseOrders({ vendor: vendorId });
                    setOrders(oData);
                    if (onSelectPo) {
                        onSelectPo(newPo.id);
                    }
                }}
            />

            {selectedInvoiceId && (
                <VendorInvoiceDetailModal
                    isOpen={Boolean(selectedInvoiceId)}
                    onClose={() => setSelectedInvoiceId(null)}
                    invoiceId={selectedInvoiceId}
                    onInvoiceUpdated={async () => {
                        const bData = await getVendorInvoices({ vendor: vendorId });
                        setBills(bData);
                        loadVendorData();
                    }}
                />
            )}

            {(showPaymentModal || selectedInvoiceForPayment) && (
                <VendorPaymentModal
                    isOpen={Boolean(showPaymentModal || selectedInvoiceForPayment)}
                    onClose={() => {
                        setShowPaymentModal(false);
                        setSelectedInvoiceForPayment(null);
                    }}
                    onPaymentCreated={loadVendorData}
                    defaultVendorId={vendorId}
                    defaultInvoiceId={selectedInvoiceForPayment || undefined}
                />
            )}
        </div>
    );
};

