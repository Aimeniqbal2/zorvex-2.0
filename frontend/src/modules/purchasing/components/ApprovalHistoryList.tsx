import React, { useEffect, useState } from 'react';
import { purchasingApi } from '../api';
import type { ApprovalHistory } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Toolbar } from '../../../layouts/PageLayout';

export const ApprovalHistoryList: React.FC = () => {
    const [history, setHistory] = useState<ApprovalHistory[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const data = await purchasingApi.getApprovalHistory();
                setHistory(data.results || data);
            } catch (err) {
                console.error('Failed to fetch approval history', err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    const columns: Column<ApprovalHistory>[] = [
        {
            key: 'action',
            header: 'Action',
            render: (item) => <span style={{ fontWeight: 500 }}>{item.action}</span>
        },
        {
            key: 'document_model',
            header: 'Document Model',
            render: (item) => item.document_model
        },
        {
            key: 'document_id',
            header: 'Document ID',
            render: (item) => item.document_id
        },
        {
            key: 'comments',
            header: 'Comments',
            render: (item) => item.comments || '-'
        }
    ];

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>Approval History</div>
            </Toolbar>
            
            <DataTable 
                data={history}
                columns={columns}
                isLoading={loading}
                keyExtractor={(row) => String(row.id)}
            />
        </div>
    );
};
