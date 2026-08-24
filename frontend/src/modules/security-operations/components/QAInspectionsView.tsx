import React, { useState, useEffect } from 'react';
import { apiClient as api } from '../../../api/client';

export const QAInspectionsView: React.FC = () => {
    const [inspections, setInspections] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInspections();
    }, []);

    const fetchInspections = async () => {
        try {
            const response = await api.get('/api/operations/qa-inspections/');
            setInspections(response.data.results || response.data);
        } catch (error) {
            console.error('Failed to fetch QA inspections', error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleAction = async (id: number, action: string) => {
        try {
            const res = await api.post(`/api/operations/qa-inspections/${id}/${action}/`);
            alert(`Success: ${res.data.status || 'Action completed'}`);
            fetchInspections();
        } catch (error: any) {
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    if (loading) return <div>Loading QA Inspections...</div>;

    return (
        <div className="security-subview">
            <div className="subview-header">
                <h2>Quality Assurance Inspections</h2>
                <button className="primary-btn">New Inspection</button>
            </div>
            
            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Template</th>
                            <th>Contract / Site</th>
                            <th>Inspector</th>
                            <th>Score</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {inspections.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{textAlign: 'center'}}>No QA inspections found.</td>
                            </tr>
                        ) : (
                            inspections.map(inspection => (
                                <tr key={inspection.id}>
                                    <td>{inspection.inspection_date}</td>
                                    <td>{inspection.template_name}</td>
                                    <td>
                                        {inspection.service_contract_number || 'N/A'}<br/>
                                        <small className="text-muted">{inspection.operational_site_name}</small>
                                    </td>
                                    <td>{inspection.inspector_name}</td>
                                    <td>{inspection.score !== null ? `${inspection.score}%` : 'N/A'}</td>
                                    <td>
                                        <span className={`status-badge status-${inspection.status.toLowerCase()}`}>
                                            {inspection.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            {inspection.status === 'DRAFT' && (
                                                <button className="btn-small" onClick={() => handleAction(inspection.id, 'submit')}>Submit</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
