import React, { useState } from 'react';
import type { ProcurementDocument } from '../../types';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { GoodsReceiptEditor } from '../editors/GoodsReceiptEditor';
import { PurchaseReturnEditor } from '../editors/PurchaseReturnEditor';
import { purchasingApi } from '../../api';

interface Props {
    document: ProcurementDocument;
    onClose: () => void;
    onRefresh: () => void;
    warehouses: any[];
}

export const ProcurementDocumentDetail: React.FC<Props> = ({ document, onClose, onRefresh, warehouses }) => {
    const [activeAction, setActiveAction] = useState<'RECEIVE' | 'RETURN' | null>(null);

    const handleAction = async (action: string) => {
        if (!window.confirm(`Are you sure you want to ${action} this document?`)) return;
        try {
            await purchasingApi.postAction(document.id, action);
            alert(`Document successfully transitioned via ${action}!`);
            onRefresh();
            onClose();
        } catch (error: any) {
            alert(error.response?.data?.detail || JSON.stringify(error.response?.data) || "Failed to process action.");
        }
    };

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                <h2 style={{ margin: 0 }}>{document.document_type.replace('_', ' ')}: {document.number}</h2>
                <Badge variant={
                    document.status === 'APPROVED' ? 'success' : 
                    document.status === 'PARTIALLY_RECEIVED' ? 'warning' : 
                    document.status === 'RECEIVED' ? 'primary' : 'default'
                }>
                    {document.status}
                </Badge>
            </div>

            {activeAction === 'RECEIVE' ? (
                <GoodsReceiptEditor poId={document.id} onClose={() => setActiveAction(null)} onSuccess={() => { setActiveAction(null); onRefresh(); }} warehouses={warehouses} />
            ) : activeAction === 'RETURN' ? (
                <PurchaseReturnEditor grnOrPoId={document.id} onClose={() => setActiveAction(null)} onSuccess={() => { setActiveAction(null); onRefresh(); }} warehouses={warehouses} />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                        <div><strong>Date:</strong> {document.document_date}</div>
                        {document.expected_delivery_date && <div><strong>Expected Date:</strong> {document.expected_delivery_date}</div>}
                        {document.crm_entity_name && <div><strong>Supplier:</strong> {document.crm_entity_name}</div>}
                        {document.reference_number && <div><strong>Reference:</strong> {document.reference_number}</div>}
                        {document.warehouse && <div><strong>Warehouse ID:</strong> {document.warehouse}</div>}
                        {document.parent_document && <div><strong>Source Document ID:</strong> {document.parent_document}</div>}
                        <div><strong>Total Amount:</strong> {document.currency} {document.total_amount}</div>
                        <div style={{ gridColumn: 'span 3' }}><strong>Notes:</strong> {document.notes || '-'}</div>
                    </div>

                    <h4 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Lines</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '24px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <th style={{ padding: '8px' }}>Item</th>
                                <th style={{ padding: '8px' }}>Qty</th>
                                {(document.document_type === 'PURCHASE_ORDER' || document.document_type === 'GOODS_RECEIPT' || document.document_type === 'PURCHASE_RETURN') && (
                                    <>
                                        <th style={{ padding: '8px' }}>Received</th>
                                        <th style={{ padding: '8px' }}>Returned</th>
                                    </>
                                )}
                                <th style={{ padding: '8px' }}>Unit Price</th>
                                <th style={{ padding: '8px' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {document.lines?.map((line: any) => (
                                <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '8px' }}>{line.item_name || line.item_sku || line.item}</td>
                                    <td style={{ padding: '8px' }}>{line.quantity}</td>
                                    {(document.document_type === 'PURCHASE_ORDER' || document.document_type === 'GOODS_RECEIPT' || document.document_type === 'PURCHASE_RETURN') && (
                                        <>
                                            <td style={{ padding: '8px' }}>{line.received_quantity || 0}</td>
                                            <td style={{ padding: '8px' }}>{line.returned_quantity || 0}</td>
                                        </>
                                    )}
                                    <td style={{ padding: '8px' }}>{line.unit_price}</td>
                                    <td style={{ padding: '8px' }}>{line.total_amount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                        <Button variant="ghost" onClick={onClose}>Close</Button>
                        
                        {document.status === 'DRAFT' && (
                            <Button variant="secondary" onClick={() => handleAction('submit')}>Submit</Button>
                        )}
                        
                        {document.status === 'PENDING_APPROVAL' && (
                            <Button variant="primary" onClick={() => handleAction('approve')}>Approve</Button>
                        )}

                        {document.document_type === 'PURCHASE_ORDER' && ['APPROVED', 'PARTIALLY_RECEIVED'].includes(document.status) && (
                            <Button variant="primary" onClick={() => setActiveAction('RECEIVE')}>Receive Goods</Button>
                        )}

                        {(document.document_type === 'GOODS_RECEIPT' && document.status === 'RECEIVED') && (
                            <Button variant="danger" onClick={() => setActiveAction('RETURN')}>Purchase Return</Button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
