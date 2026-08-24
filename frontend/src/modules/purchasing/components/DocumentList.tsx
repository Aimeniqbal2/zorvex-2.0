import React, { useEffect, useState } from 'react';
import { purchasingApi } from '../api';
import type { ProcurementDocument } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Toolbar } from '../../../layouts/PageLayout';

// Specific Editors
import { PurchaseRequestEditor } from './editors/PurchaseRequestEditor';
import { RFQEditor } from './editors/RFQEditor';
import { QuotationEditor } from './editors/QuotationEditor';
import { PurchaseOrderEditor } from './editors/PurchaseOrderEditor';
import { VendorInvoiceEditor } from './editors/VendorInvoiceEditor';

// Details
import { ProcurementDocumentDetail } from './details/ProcurementDocumentDetail';

interface DocumentListProps {
    documentType: string;
}

export const DocumentList: React.FC<DocumentListProps> = ({ documentType }) => {
    const [documents, setDocuments] = useState<ProcurementDocument[]>([]);
    const [allDocuments, setAllDocuments] = useState<ProcurementDocument[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Lookups
    const [items, setItems] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const data = await purchasingApi.getDocuments({ document_type: documentType });
            setDocuments(data.results || data);
            
            // Fetch all for cross-referencing (parent_document logic)
            const allData = await purchasingApi.getDocuments();
            setAllDocuments(allData.results || allData);
        } catch (err) {
            console.error('Failed to fetch documents', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [documentType]);

    useEffect(() => {
        const fetchLookups = async () => {
            try {
                const [i, w, s] = await Promise.all([
                    purchasingApi.getItems(),
                    purchasingApi.getWarehouses(),
                    purchasingApi.getSuppliers()
                ]);
                setItems(i.results || i);
                setWarehouses(w.results || w);
                setSuppliers(s.results || s);
            } catch (err) {
                console.error('Failed to fetch lookups', err);
            }
        };
        fetchLookups();
    }, []);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedDocument, setSelectedDocument] = useState<ProcurementDocument | null>(null);

    const handleCreateNew = () => {
        setIsCreateModalOpen(true);
    };

    const handleSuccess = () => {
        setIsCreateModalOpen(false);
        fetchDocuments();
    };

    const renderEditor = () => {
        const commonProps = {
            onClose: () => setIsCreateModalOpen(false),
            onSuccess: handleSuccess,
            items,
            warehouses,
            suppliers,
            documents: allDocuments
        };

        switch(documentType) {
            case 'PURCHASE_REQUEST': return <PurchaseRequestEditor {...commonProps} />;
            case 'RFQ': return <RFQEditor {...commonProps} />;
            case 'QUOTATION': return <QuotationEditor {...commonProps} />;
            case 'PURCHASE_ORDER': return <PurchaseOrderEditor {...commonProps} />;
            case 'GOODS_RECEIPT': 
                // Creating an empty GRN isn't really the flow, it should be launched from PO detail.
                // But just in case we need a fallback:
                return <div style={{padding: 20, background: 'white'}}>Please initiate Goods Receipt from an Approved Purchase Order. <Button onClick={() => setIsCreateModalOpen(false)}>Close</Button></div>;
            case 'PURCHASE_RETURN':
                return <div style={{padding: 20, background: 'white'}}>Please initiate Purchase Return from a Received Document. <Button onClick={() => setIsCreateModalOpen(false)}>Close</Button></div>;
            case 'VENDOR_INVOICE': return <VendorInvoiceEditor {...commonProps} />;
            default: return <div>Unknown document type</div>;
        }
    };

    const columns: Column<ProcurementDocument>[] = [
        {
            key: 'number',
            header: 'Number',
            render: (doc) => <span style={{ fontWeight: 500 }}>{doc.number}</span>
        },
        {
            key: 'document_date',
            header: 'Date',
            render: (doc) => doc.document_date
        },
        {
            key: 'status',
            header: 'Status',
            render: (doc) => (
                <Badge variant={
                    doc.status === 'APPROVED' ? 'success' : 
                    doc.status === 'PARTIALLY_RECEIVED' ? 'warning' :
                    doc.status === 'RECEIVED' ? 'primary' : 'default'
                }>
                    {doc.status}
                </Badge>
            )
        },
        {
            key: 'total_amount',
            header: 'Total Amount',
            render: (doc) => `${doc.currency} ${doc.total_amount}`
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (doc) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => setSelectedDocument(doc)}>View</Button>
                </div>
            )
        }
    ];

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>{documentType.replace('_', ' ')}s</div>
                <div style={{ flex: 1 }} />
                {!['GOODS_RECEIPT', 'PURCHASE_RETURN'].includes(documentType) && (
                    <Button variant="primary" onClick={handleCreateNew}>
                        Create New
                    </Button>
                )}
            </Toolbar>
            
            {isCreateModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
                    alignItems: 'center', zIndex: 1000, overflowY: 'auto'
                }}>
                    {renderEditor()}
                </div>
            )}
            
            <DataTable 
                data={documents}
                columns={columns}
                isLoading={loading}
                keyExtractor={(row) => String(row.id)}
            />

            {selectedDocument && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
                    alignItems: 'center', zIndex: 1000, overflowY: 'auto'
                }}>
                    <ProcurementDocumentDetail 
                        document={selectedDocument} 
                        onClose={() => setSelectedDocument(null)} 
                        onRefresh={() => { setSelectedDocument(null); fetchDocuments(); }}
                        warehouses={warehouses}
                    />
                </div>
            )}
        </div>
    );
};
