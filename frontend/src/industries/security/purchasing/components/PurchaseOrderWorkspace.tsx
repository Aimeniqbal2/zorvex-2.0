import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Modal } from '../../../../components/ui/Modal';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    getPurchaseOrder, submitPurchaseOrderForApproval, approvePurchaseOrder, 
    rejectPurchaseOrder, sendPurchaseOrder, cancelPurchaseOrder, deletePurchaseOrder,
    getPOReceivingSummary, postGoodsReceipt, cancelGoodsReceipt, getPOBillingSummary,
    type PurchaseOrder, type POReceivingSummary, type POBillingSummary 
} from '../api';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import { GoodsReceiptModal } from './GoodsReceiptModal';
import { VendorInvoiceModal } from './VendorInvoiceModal';
import { VendorInvoiceDetailModal } from './VendorInvoiceDetailModal';

interface PurchaseOrderWorkspaceProps {
    poId: string;
    onBack: () => void;
    onOpenVendor?: (vendorId: string) => void;
}

export const PurchaseOrderWorkspace: React.FC<PurchaseOrderWorkspaceProps> = ({ 
    poId, 
    onBack,
    onOpenVendor 
}) => {
    const [po, setPo] = useState<PurchaseOrder | null>(null);
    const [receivingSummary, setReceivingSummary] = useState<POReceivingSummary | null>(null);
    const [billingSummary, setBillingSummary] = useState<POBillingSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [receivingLoading, setReceivingLoading] = useState(false);
    const [billingLoading, setBillingLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'approval' | 'documents' | 'receipts' | 'bills'>('overview');

    // Action Modals & Prompts
    const [showEditModal, setShowEditModal] = useState(false);
    const [showGRNModal, setShowGRNModal] = useState(false);
    const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
    const [selectedDetailInvoiceId, setSelectedDetailInvoiceId] = useState<string | null>(null);
    const [showApproveModal, setShowApproveModal] = useState(false);


    const [approvalNotes, setApprovalNotes] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        loadPoData();
        loadReceivingData();
        loadBillingData();
    }, [poId]);


    const loadPoData = async () => {
        setLoading(true);
        try {
            const data = await getPurchaseOrder(poId);
            setPo(data);
        } catch {
            useToastStore.getState().error('Failed to load purchase order details.');
        } finally {
            setLoading(false);
        }
    };

    const loadReceivingData = async () => {
        setReceivingLoading(true);
        try {
            const sum = await getPOReceivingSummary(poId);
            setReceivingSummary(sum);
        } catch {
            // Ignored if summary is not available for draft PO
        } finally {
            setReceivingLoading(false);
        }
    };

    const loadBillingData = async () => {
        setBillingLoading(true);
        try {
            const sum = await getPOBillingSummary(poId);
            setBillingSummary(sum);
        } catch {
            // Ignored if billing summary not available for draft PO
        } finally {
            setBillingLoading(false);
        }
    };


    const handlePostGRN = async (grnId: string) => {
        if (!window.confirm("Post this Goods Receipt and intake accepted quantities into warehouse stock?")) return;
        setActionLoading(true);
        try {
            await postGoodsReceipt(grnId);
            useToastStore.getState().success("Goods Receipt posted successfully. Inventory updated.");
            await loadPoData();
            await loadReceivingData();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || "Failed to post Goods Receipt.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelGRN = async (grnId: string) => {
        if (!window.confirm("Cancel this draft Goods Receipt?")) return;
        setActionLoading(true);
        try {
            await cancelGoodsReceipt(grnId);
            useToastStore.getState().success("Goods Receipt cancelled.");
            await loadReceivingData();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || "Failed to cancel Goods Receipt.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleSubmitForApproval = async () => {
        if (!window.confirm('Submit this Purchase Order for managerial approval?')) return;
        setActionLoading(true);
        try {
            const updated = await submitPurchaseOrderForApproval(poId);
            setPo(updated);
            useToastStore.getState().success(`PO ${updated.number} submitted for approval.`);
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to submit PO.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleApprove = async () => {
        setActionLoading(true);
        try {
            const updated = await approvePurchaseOrder(poId, approvalNotes);
            setPo(updated);
            setShowApproveModal(false);
            setApprovalNotes('');
            useToastStore.getState().success(`PO ${updated.number} approved successfully.`);
            await loadReceivingData();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to approve PO.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            useToastStore.getState().error('Please enter a rejection reason.');
            return;
        }
        setActionLoading(true);
        try {
            const updated = await rejectPurchaseOrder(poId, rejectionReason);
            setPo(updated);
            setShowRejectModal(false);
            setRejectionReason('');
            useToastStore.getState().success(`PO ${updated.number} rejected.`);
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to reject PO.');
        } finally {
            setActionLoading(false);
        }
    };


    const handleSend = async () => {
        if (!window.confirm('Mark this Purchase Order as SENT / Dispatched to vendor?')) return;
        setActionLoading(true);
        try {
            const updated = await sendPurchaseOrder(poId);
            setPo(updated);
            useToastStore.getState().success(`PO ${updated.number} marked as Sent.`);
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to update PO status.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async () => {
        setActionLoading(true);
        try {
            const updated = await cancelPurchaseOrder(poId, cancelReason);
            setPo(updated);
            setShowCancelModal(false);
            setCancelReason('');
            useToastStore.getState().success(`PO ${updated.number} cancelled.`);
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to cancel PO.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Delete draft purchase order ${po?.number}?`)) return;
        try {
            await deletePurchaseOrder(poId);
            useToastStore.getState().success('Purchase order deleted.');
            onBack();
        } catch {
            useToastStore.getState().error('Failed to delete purchase order.');
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                <div>Loading Purchase Order...</div>
            </div>
        );
    }

    if (!po) {
        return (
            <div style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ color: '#ef4444', marginBottom: '12px' }}>Purchase Order not found.</div>
                <Button variant="secondary" onClick={onBack}>Back to Purchase Orders</Button>
            </div>
        );
    }

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'APPROVED':
                return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
            case 'PENDING_APPROVAL':
                return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
            case 'SENT':
                return { bg: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary, #6366f1)', border: 'rgba(99, 102, 241, 0.3)' };
            case 'CANCELLED':
            case 'REJECTED':
                return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' };
            default:
                return { bg: 'var(--color-surface-secondary)', color: 'var(--color-text-muted)', border: 'var(--color-border)' };
        }
    };

    const statusStyle = getStatusStyle(po.status);

    const tabs = [
        { id: 'overview', label: 'Overview', icon: 'bx-detail' },
        { id: 'items', label: `PO Lines (${po.lines?.length || 0})`, icon: 'bx-package' },
        { id: 'approval', label: 'Approval & History', icon: 'bx-check-shield' },
        { id: 'documents', label: `Attachments (${po.attachments?.length || 0})`, icon: 'bx-file' },
        { id: 'receipts', label: 'Receipts (GRN)', icon: 'bx-box' },
        { id: 'bills', label: 'Bills / Invoices', icon: 'bx-receipt' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Top Bar / Breadcrumb */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <i className='bx bx-arrow-back'></i> Back to PO List
                    </Button>
                    <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text)' }}>
                        {po.number}
                    </span>
                </div>

                {/* Workflow Actions */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {po.status === 'DRAFT' && (
                        <>
                            <Button variant="secondary" size="sm" onClick={() => setShowEditModal(true)}>
                                <i className='bx bx-edit'></i> Edit Draft
                            </Button>
                            <Button variant="primary" size="sm" onClick={handleSubmitForApproval} disabled={actionLoading}>
                                <i className='bx bx-paper-plane'></i> Submit for Approval
                            </Button>
                            <Button variant="danger" size="sm" onClick={handleDelete}>
                                <i className='bx bx-trash'></i> Delete
                            </Button>
                        </>
                    )}

                    {po.status === 'PENDING_APPROVAL' && (
                        <>
                            <Button variant="danger" size="sm" onClick={() => setShowRejectModal(true)} disabled={actionLoading}>
                                <i className='bx bx-x-circle'></i> Reject PO
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => setShowApproveModal(true)} disabled={actionLoading}>
                                <i className='bx bx-check-circle'></i> Approve PO
                            </Button>
                        </>
                    )}

                    {po.status === 'APPROVED' && (
                        <>
                            <Button variant="primary" size="sm" onClick={() => setShowGRNModal(true)}>
                                <i className='bx bx-box'></i> Receive Goods
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleSend} disabled={actionLoading}>
                                <i className='bx bx-send'></i> Mark as Sent
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setShowCancelModal(true)} disabled={actionLoading}>
                                <i className='bx bx-block'></i> Cancel PO
                            </Button>
                        </>
                    )}

                    {po.status === 'SENT' && (
                        <>
                            <Button variant="primary" size="sm" onClick={() => setShowGRNModal(true)}>
                                <i className='bx bx-box'></i> Receive Goods
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setShowCancelModal(true)} disabled={actionLoading}>
                                <i className='bx bx-block'></i> Cancel PO
                            </Button>
                        </>
                    )}

                    {po.status === 'PARTIALLY_RECEIVED' && (
                        <Button variant="primary" size="sm" onClick={() => setShowGRNModal(true)}>
                            <i className='bx bx-box'></i> Receive Remaining Goods
                        </Button>
                    )}
                </div>
            </div>


            {/* PO Banner Card */}
            <Card style={{ padding: '20px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ 
                            width: '54px', height: '54px', borderRadius: '12px', 
                            background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary, #6366f1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px'
                        }}>
                            <i className='bx bx-cart'></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>{po.number}</h2>
                                <span style={{ 
                                    fontSize: '11px', padding: '3px 8px', borderRadius: '6px', 
                                    background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}`,
                                    fontWeight: 700
                                }}>
                                    {po.status}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '13px', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                                <span 
                                    onClick={() => po.vendor && onOpenVendor && onOpenVendor(po.vendor)}
                                    style={{ cursor: po.vendor ? 'pointer' : 'default', color: po.vendor ? 'var(--color-primary)' : 'inherit', fontWeight: 600 }}
                                >
                                    <i className='bx bx-buildings'></i> {po.vendor_name || po.crm_entity_name || 'Vendor'}
                                </span>
                                <span><i className='bx bx-calendar'></i> Ordered: {new Date(po.document_date).toLocaleDateString()}</span>
                                {po.expected_delivery_date && (
                                    <span><i className='bx bx-time-five'></i> Expected: {new Date(po.expected_delivery_date).toLocaleDateString()}</span>
                                )}
                                {po.warehouse_name && (
                                    <span><i className='bx bx-store'></i> Delivery: {po.warehouse_name}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Subtotal
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                                PKR {Number(po.subtotal_amount || 0).toLocaleString()}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Total Tax / Disc.
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                                +{Number(po.tax_amount || 0).toLocaleString()} / -{Number(po.discount_amount || 0).toLocaleString()}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Grand Total
                            </div>
                            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-primary)' }}>
                                PKR {Number(po.total_amount || 0).toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Rejection Alert if present */}
            {po.rejection_reason && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className='bx bx-error-circle' style={{ fontSize: '20px' }}></i>
                    <div>
                        <strong>Rejection Reason:</strong> {po.rejection_reason}
                    </div>
                </div>
            )}

            {/* Tabs */}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        {/* Commercial Summary */}
                        <Card style={{ padding: '18px', borderRadius: '12px' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-calculator' style={{ color: 'var(--color-primary)' }}></i> Commercial Breakdown
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Lines Count:</span>
                                    <strong>{po.lines?.length || 0} items</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Subtotal Amount:</span>
                                    <span>PKR {Number(po.subtotal_amount || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Discount Amount:</span>
                                    <span style={{ color: '#ef4444' }}>- PKR {Number(po.discount_amount || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Tax Amount:</span>
                                    <span>+ PKR {Number(po.tax_amount || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                                    <span style={{ fontWeight: 700 }}>Grand Total:</span>
                                    <strong style={{ color: 'var(--color-primary)', fontSize: '15px' }}>PKR {Number(po.total_amount || 0).toLocaleString()}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Payment Terms:</span>
                                    <span>{po.payment_terms || 'Net 30'}</span>
                                </div>
                            </div>
                        </Card>

                        {/* Supplier & Delivery */}
                        <Card style={{ padding: '18px', borderRadius: '12px' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-buildings' style={{ color: 'var(--color-primary)' }}></i> Vendor & Logistics
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Supplier Name:</span>
                                    <strong>{po.vendor_name || po.crm_entity_name || 'N/A'}</strong>
                                </div>
                                {po.vendor_code && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Vendor Code:</span>
                                        <span>{po.vendor_code}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Delivery Destination:</span>
                                    <span>{po.warehouse_name || 'Central Armory'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Created By:</span>
                                    <span>{po.created_by_name || 'Admin User'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Created Date:</span>
                                    <span>{new Date(po.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </Card>

                        {/* Notes */}
                        <Card style={{ padding: '18px', borderRadius: '12px' }}>
                            <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-notepad' style={{ color: 'var(--color-primary)' }}></i> Order Instructions
                            </h4>
                            <div style={{ fontSize: '13px', color: 'var(--color-text)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                {po.notes || 'No special remarks recorded for this purchase order.'}
                            </div>
                        </Card>
                    </div>
                )}

                {/* 2. Items Tab */}
                {activeTab === 'items' && (
                    <Card style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Purchase Order Line Items</h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Commercial items, ordered quantities, received progress, and agreed unit rates.
                                </p>
                            </div>
                            {po.status === 'DRAFT' && (
                                <Button variant="secondary" size="sm" onClick={() => setShowEditModal(true)}>
                                    <i className='bx bx-edit'></i> Edit Lines
                                </Button>
                            )}
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 14px' }}>#</th>
                                        <th style={{ padding: '10px 14px' }}>Item Details</th>
                                        <th style={{ padding: '10px 14px' }}>Vendor SKU</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Ordered Qty</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Received Qty</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Remaining</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Unit Rate</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Disc. / Tax</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Line Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {po.lines?.map((line, idx) => (
                                        <tr key={line.id || idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)' }}>{idx + 1}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <strong style={{ color: 'var(--color-text)' }}>{line.item_name || 'Inventory Item'}</strong>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                    SKU: {line.item_sku || 'N/A'} {line.item_brand ? `• ${line.item_brand}` : ''}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>
                                                {line.vendor_sku || '—'}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                                                {line.quantity} {line.unit_of_measure || 'pcs'}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: Number(line.received_quantity || 0) > 0 ? '#10b981' : 'var(--color-text-muted)' }}>
                                                {line.received_quantity || 0}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                {line.remaining_quantity !== undefined ? line.remaining_quantity : line.quantity}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                PKR {Number(line.unit_price).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                                                -{Number(line.discount_amount || 0).toLocaleString()} / +{Number(line.tax_amount || 0).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                                                PKR {Number(line.total_amount || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                {/* 3. Approval & History Tab */}
                {activeTab === 'approval' && (
                    <Card style={{ padding: '20px', borderRadius: '12px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700 }}>Approval Flow & Audit Timeline</h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                    Approval Status
                                </div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: statusStyle.color, marginTop: '4px' }}>
                                    {po.status}
                                </div>
                            </div>

                            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                    Approved By
                                </div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', marginTop: '4px' }}>
                                    {po.approved_by_name || (po.status === 'APPROVED' || po.status === 'SENT' ? 'Authorized Manager' : 'Pending Authorization')}
                                </div>
                            </div>

                            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                    Approved At Timestamp
                                </div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginTop: '4px' }}>
                                    {po.approved_at ? new Date(po.approved_at).toLocaleString() : '—'}
                                </div>
                            </div>
                        </div>

                        {po.approval_notes && (
                            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '16px', fontSize: '13px' }}>
                                <strong>Approval Notes:</strong> {po.approval_notes}
                            </div>
                        )}

                        {/* Audit Trail Timeline */}
                        <div style={{ marginTop: '16px' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: 'var(--color-text-muted)' }}>Audit Log</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {po.audit_trails && po.audit_trails.length > 0 ? (
                                    po.audit_trails.map((audit: any) => (
                                        <div key={audit.id} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: '12.5px', display: 'flex', justifyContent: 'space-between' }}>
                                            <div>
                                                <strong>{audit.event}:</strong> {audit.details}
                                                <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>by {audit.user_name}</span>
                                            </div>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
                                                {new Date(audit.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ color: 'var(--color-text-muted)', fontSize: '12.5px', fontStyle: 'italic' }}>
                                        Document created on {new Date(po.created_at).toLocaleDateString()}.
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                )}

                {/* 4. Documents Tab */}
                {activeTab === 'documents' && (
                    <Card style={{ padding: '20px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Purchase Order Documents</h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Vendor quotation sheets, comparison forms, and executive approval sign-offs.
                                </p>
                            </div>
                        </div>

                        {po.attachments && po.attachments.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                                {po.attachments.map((att: any) => (
                                    <div key={att.id} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '13px' }}>{att.description || 'Document File'}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Uploaded by {att.uploaded_by_name}</div>
                                        </div>
                                        <a href={att.file} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', fontSize: '16px' }}>
                                            <i className='bx bx-download'></i>
                                        </a>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                                <i className='bx bx-file-blank' style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                                <div>No attachments uploaded for this Purchase Order.</div>
                            </div>
                        )}
                    </Card>
                )}

                {/* 5. Phase S-3C: Goods Receipts (GRN) Tab */}
                {activeTab === 'receipts' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Receiving Progress Header Card */}
                        <Card style={{ padding: '20px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className='bx bx-box' style={{ color: 'var(--color-primary)' }}></i>
                                        PO Receiving & Fulfillment Status
                                    </h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                        Track inward shipments, partial deliveries, accepted stock intake, and vendor challans.
                                    </p>
                                </div>

                                {['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status) && (
                                    <Button 
                                        variant="primary" 
                                        size="sm" 
                                        onClick={() => setShowGRNModal(true)}
                                    >
                                        <i className='bx bx-plus-circle'></i> Receive Goods (GRN)
                                    </Button>
                                )}
                            </div>

                            {/* Summary Metrics */}
                            {receivingLoading && !receivingSummary ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                    ⏳ Loading receiving progress...
                                </div>
                            ) : receivingSummary ? (
                                <>

                                    {/* Overall Progress Bar */}
                                    {(() => {
                                        const totOrdered = receivingSummary.lines.reduce((a, b) => a + b.ordered_quantity, 0);
                                        const totReceived = receivingSummary.lines.reduce((a, b) => a + b.previously_received, 0);
                                        const pct = totOrdered > 0 ? Math.min(100, Math.round((totReceived / totOrdered) * 100)) : 0;

                                        return (
                                            <div style={{ marginBottom: '20px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                                                    <span style={{ fontWeight: 600 }}>Overall PO Receipt Progress</span>
                                                    <span style={{ fontWeight: 700, color: pct === 100 ? '#10b981' : '#38bdf8' }}>{pct}% Complete ({totReceived} of {totOrdered} units)</span>
                                                </div>
                                                <div style={{ height: '8px', width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: `${pct}%`,
                                                        backgroundColor: pct === 100 ? '#10b981' : '#38bdf8',
                                                        borderRadius: '4px',
                                                        transition: 'width 0.3s ease'
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Line Breakdown Table */}
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600 }}>Line Item</th>
                                                    <th style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600 }}>Ordered</th>
                                                    <th style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600 }}>Accepted IN</th>
                                                    <th style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600 }}>Remaining</th>
                                                    <th style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {receivingSummary.lines.map((line, idx) => {
                                                    const isComplete = line.remaining_quantity <= 0;
                                                    const isPartial = line.previously_received > 0 && line.remaining_quantity > 0;

                                                    return (
                                                        <tr key={line.po_line_id} style={{
                                                            borderBottom: '1px solid var(--color-border)',
                                                            backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                                                        }}>
                                                            <td style={{ padding: '12px 14px' }}>
                                                                <div style={{ fontWeight: 600 }}>{line.item_name}</div>
                                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                                    Code: {line.item_code || 'N/A'} {line.track_serial_number && <span style={{ color: '#38bdf8', fontWeight: 600 }}>[SERIAL TRACKED]</span>}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                                                                {line.ordered_quantity} {line.unit_of_measure}
                                                            </td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                                                                {line.previously_received} {line.unit_of_measure}
                                                            </td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: isComplete ? '#94a3b8' : '#38bdf8', fontWeight: 600 }}>
                                                                {line.remaining_quantity} {line.unit_of_measure}
                                                            </td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '12px',
                                                                    fontWeight: 600,
                                                                    backgroundColor: isComplete ? 'rgba(16, 185, 129, 0.15)' : isPartial ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                                    color: isComplete ? '#10b981' : isPartial ? '#38bdf8' : '#f59e0b',
                                                                    border: `1px solid ${isComplete ? 'rgba(16, 185, 129, 0.3)' : isPartial ? 'rgba(56, 189, 248, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                                                }}>
                                                                    {isComplete ? 'FULFILLED' : isPartial ? 'PARTIAL' : 'PENDING'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : null}
                        </Card>


                        {/* Goods Receipts / GRN History */}
                        <Card style={{ padding: '20px', borderRadius: '12px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700 }}>
                                Goods Receipts (GRN) History
                            </h3>

                            {receivingSummary?.grns && receivingSummary.grns.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {receivingSummary.grns.map((grn) => {
                                        const isPosted = grn.status === 'POSTED';
                                        const isDraft = grn.status === 'DRAFT';

                                        return (
                                            <div key={grn.id} style={{
                                                padding: '16px',
                                                borderRadius: '10px',
                                                border: '1px solid var(--color-border)',
                                                background: 'var(--color-surface)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '10px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{
                                                            width: '34px',
                                                            height: '34px',
                                                            borderRadius: '8px',
                                                            backgroundColor: isPosted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                            color: isPosted ? '#10b981' : '#f59e0b',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '16px'
                                                        }}>
                                                            📥
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                                                                {grn.number}
                                                            </div>
                                                            <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                                                                Date: {grn.document_date} &bull; Warehouse: {grn.warehouse_name} {grn.reference_number && `• Challan: ${grn.reference_number}`}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '3px 8px',
                                                            borderRadius: '12px',
                                                            fontWeight: 700,
                                                            backgroundColor: isPosted ? 'rgba(16, 185, 129, 0.15)' : isDraft ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                                            color: isPosted ? '#10b981' : isDraft ? '#f59e0b' : '#94a3b8',
                                                            border: `1px solid ${isPosted ? 'rgba(16, 185, 129, 0.3)' : isDraft ? 'rgba(245, 158, 11, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`
                                                        }}>
                                                            {grn.status}
                                                        </span>

                                                        {isDraft && (
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                <Button 
                                                                    variant="primary" 
                                                                    size="sm" 
                                                                    onClick={() => handlePostGRN(grn.id)}
                                                                    disabled={actionLoading}
                                                                >
                                                                    Post Stock IN
                                                                </Button>
                                                                <Button 
                                                                    variant="danger" 
                                                                    size="sm" 
                                                                    onClick={() => handleCancelGRN(grn.id)}
                                                                    disabled={actionLoading}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--color-text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                                                    <div>
                                                        Accepted to Stock: <strong style={{ color: '#10b981' }}>{grn.total_accepted_quantity} units</strong>
                                                    </div>
                                                    {grn.total_rejected_quantity > 0 && (
                                                        <div>
                                                            Rejected / Damaged: <strong style={{ color: '#f87171' }}>{grn.total_rejected_quantity} units</strong>
                                                        </div>
                                                    )}
                                                    <div>
                                                        Received By: <strong style={{ color: '#ffffff' }}>{grn.created_by_name || 'Staff'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                                    <i className='bx bx-box' style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                                    <div>No Goods Receipts recorded yet for this Purchase Order.</div>
                                    {['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status) && (
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            onClick={() => setShowGRNModal(true)} 
                                            style={{ marginTop: '12px' }}
                                        >
                                            <i className='bx bx-plus-circle'></i> Receive First Delivery
                                        </Button>
                                    )}
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {activeTab === 'bills' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Summary & Create Bill Action */}
                        <Card style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>Vendor Invoices & Three-Way Matching</span>
                                        {billingLoading && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>(Refreshing...)</span>}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
                                        Verified vendor bills matching ordered quantities, warehouse receipts (GRN), and invoiced amounts.
                                    </p>
                                </div>


                                {['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status) && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setShowCreateInvoiceModal(true)}
                                    >
                                        <i className='bx bx-receipt'></i> + Create Vendor Bill
                                    </Button>
                                )}
                            </div>

                            {/* Line by Line Billing Progress Table */}
                            {billingSummary?.lines && billingSummary.lines.length > 0 && (
                                <div style={{ marginTop: '16px', overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                                <th style={{ padding: '10px 12px' }}>Line Item</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Ordered</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Accepted (GRN)</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Previously Billed</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Remaining Billable</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO Rate</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Ordered</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {billingSummary.lines.map((bl, idx) => (
                                                <tr key={bl.po_line_id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 600, color: '#ffffff' }}>{bl.item_name}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{bl.item_code}</div>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{bl.ordered_quantity}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{bl.accepted_quantity}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{bl.billed_quantity}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: bl.remaining_billable_quantity > 0 ? '#38bdf8' : '#64748b' }}>
                                                        {bl.remaining_billable_quantity}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                                        {po.currency} {Number(bl.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#ffffff' }}>
                                                        {po.currency} {Number(bl.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        {/* Invoices List Card */}
                        <Card style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                                Linked Bills & Invoices ({billingSummary?.invoices?.length || 0})
                            </h3>

                            {billingSummary?.invoices && billingSummary.invoices.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {billingSummary.invoices.map((inv) => {
                                        const isPosted = inv.status === 'POSTED';
                                        const isMatched = inv.match_status === 'MATCHED';

                                        return (
                                            <div
                                                key={inv.id}
                                                style={{
                                                    padding: '16px',
                                                    borderRadius: '10px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '10px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{
                                                            width: '34px',
                                                            height: '34px',
                                                            borderRadius: '8px',
                                                            backgroundColor: isPosted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                                            color: isPosted ? '#10b981' : '#60a5fa',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '16px'
                                                        }}>
                                                            🧾
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                                                                {inv.number}
                                                                {inv.vendor_invoice_number && (
                                                                    <span style={{ fontSize: '12px', fontWeight: 400, color: '#60a5fa', marginLeft: '8px' }}>
                                                                        (Vendor Ref: {inv.vendor_invoice_number})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                                                                Date: {inv.document_date} {inv.due_date ? `• Due: ${inv.due_date}` : ''}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '3px 8px',
                                                            borderRadius: '12px',
                                                            fontWeight: 700,
                                                            backgroundColor: isMatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                            color: isMatched ? '#34d399' : '#f87171',
                                                            border: `1px solid ${isMatched ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                                        }}>
                                                            {inv.match_status || 'PENDING'}
                                                        </span>

                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '3px 8px',
                                                            borderRadius: '12px',
                                                            fontWeight: 700,
                                                            backgroundColor: isPosted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                                                            color: isPosted ? '#10b981' : '#60a5fa',
                                                            border: `1px solid ${isPosted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.3)'}`
                                                        }}>
                                                            {inv.status}
                                                        </span>

                                                        {inv.ap_ready && (
                                                            <span style={{
                                                                fontSize: '11px',
                                                                padding: '3px 8px',
                                                                borderRadius: '12px',
                                                                fontWeight: 700,
                                                                backgroundColor: 'rgba(16, 185, 129, 0.25)',
                                                                color: '#34d399'
                                                            }}>
                                                                🏛️ AP Ready
                                                            </span>
                                                        )}

                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => setSelectedDetailInvoiceId(inv.id)}
                                                        >
                                                            Inspect & Match
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--color-text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                                                    <div>
                                                        Payment Status: <strong style={{ color: inv.payment_status === 'PAID' ? '#10b981' : '#f59e0b' }}>{inv.payment_status || 'UNPAID'}</strong>
                                                        {inv.override_by && (
                                                            <span style={{ marginLeft: '12px', color: '#93c5fd' }}>
                                                                🛡️ Override Authorized by {inv.override_by}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        Total Invoiced: <strong style={{ color: '#ffffff', fontSize: '13px' }}>{po.currency} {Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                                    <i className='bx bx-receipt' style={{ fontSize: '32px', marginBottom: '8px' }}></i>
                                    <div>No vendor bills generated yet for this Purchase Order.</div>
                                    {['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status) && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setShowCreateInvoiceModal(true)}
                                            style={{ marginTop: '12px' }}
                                        >
                                            <i className='bx bx-plus-circle'></i> Create First Bill
                                        </Button>
                                    )}
                                </div>
                            )}
                        </Card>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            <PurchaseOrderModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                onSaved={(updated) => { setPo(updated); loadPoData(); }}
                po={po}
            />

            {/* Goods Receipt Receiving Modal */}
            <GoodsReceiptModal
                poId={po.id}
                isOpen={showGRNModal}
                onClose={() => setShowGRNModal(false)}
                onSuccess={() => {
                    loadPoData();
                    loadReceivingData();
                    loadBillingData();
                    useToastStore.getState().success("Goods received and processed successfully.");
                }}
            />

            {/* Vendor Invoice Creation Modal */}
            <VendorInvoiceModal
                isOpen={showCreateInvoiceModal}
                onClose={() => setShowCreateInvoiceModal(false)}
                purchaseOrder={po}
                onSuccess={(invId) => {
                    loadPoData();
                    loadBillingData();
                    useToastStore.getState().success("Vendor bill created and 3-way matched.");
                    if (invId) setSelectedDetailInvoiceId(invId);
                }}
            />

            {/* Vendor Invoice Detail & 3-Way Match Modal */}
            {selectedDetailInvoiceId && (
                <VendorInvoiceDetailModal
                    isOpen={Boolean(selectedDetailInvoiceId)}
                    onClose={() => setSelectedDetailInvoiceId(null)}
                    invoiceId={selectedDetailInvoiceId}
                    onInvoiceUpdated={() => {
                        loadPoData();
                        loadBillingData();
                    }}
                />
            )}



            {/* Approve Modal Prompt */}
            <Modal isOpen={showApproveModal} onClose={() => setShowApproveModal(false)} title={`Approve Purchase Order — ${po.number}`} size="medium">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--color-text)' }}>
                        Are you sure you want to approve this purchase order of <strong>PKR {Number(po.total_amount).toLocaleString()}</strong> for supplier <strong>{po.vendor_name || po.crm_entity_name}</strong>?
                    </p>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                            Approval Remarks / Notes (Optional)
                        </label>
                        <textarea
                            value={approvalNotes}
                            onChange={(e) => setApprovalNotes(e.target.value)}
                            rows={3}
                            placeholder="e.g. Budget approved under Q3 Tactical Equipment Allocation."
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '13px',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                        <Button variant="secondary" onClick={() => setShowApproveModal(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleApprove} disabled={actionLoading}>
                            {actionLoading ? 'Approving...' : 'Confirm Approval'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Reject Modal Prompt */}
            <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title={`Reject Purchase Order — ${po.number}`} size="medium">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--color-text)' }}>
                        Please provide a reason for rejecting this PO. It will be returned to Draft status for revision.
                    </p>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                            Rejection Reason *
                        </label>
                        <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={3}
                            placeholder="e.g. Requested rate exceeds budget limit, please renegotiate with vendor."
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '13px',
                                boxSizing: 'border-box'
                            }}
                            required
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                        <Button variant="secondary" onClick={() => setShowRejectModal(false)}>Cancel</Button>
                        <Button variant="danger" onClick={handleReject} disabled={actionLoading}>
                            {actionLoading ? 'Rejecting...' : 'Reject Purchase Order'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Cancel Modal Prompt */}
            <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} title={`Cancel Purchase Order — ${po.number}`} size="medium">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--color-text)' }}>
                        Cancelling this purchase order will revoke the commercial commitment.
                    </p>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                            Cancellation Remarks (Optional)
                        </label>
                        <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            rows={3}
                            placeholder="e.g. Vendor unfulfillable, items no longer required."
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '13px',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                        <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Back</Button>
                        <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                            {actionLoading ? 'Cancelling...' : 'Cancel PO'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
