import React, { useState, useEffect } from 'react';
import { apiClient as api } from '../../../api/client';

export const TemporaryServicesView: React.FC = () => {
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchServices();
    }, []);

    const fetchServices = async () => {
        try {
            const response = await api.get('/api/operations/temporary-services/');
            setServices(response.data.results || response.data);
        } catch (error) {
            console.error('Failed to fetch temporary services', error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleAction = async (id: number, action: string) => {
        try {
            const payload = action === 'generate_duties' ? { assignments: [] } : {}; // Simplified for UI
            const res = await api.post(`/api/operations/temporary-services/${id}/${action}/`, payload);
            alert(`Success: ${res.data.status || 'Action completed'}`);
            fetchServices();
        } catch (error: any) {
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    if (loading) return <div>Loading Temporary Services...</div>;

    return (
        <div className="security-subview">
            <div className="subview-header">
                <h2>Temporary Security Services</h2>
                <button className="primary-btn">New Temporary Service</button>
            </div>
            
            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Reference</th>
                            <th>Customer</th>
                            <th>Location/Site</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {services.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{textAlign: 'center'}}>No temporary services found.</td>
                            </tr>
                        ) : (
                            services.map(service => (
                                <tr key={service.id}>
                                    <td>{service.reference_number}</td>
                                    <td>{service.crm_entity_name}</td>
                                    <td>{service.operational_site_name || service.site_name}</td>
                                    <td>{new Date(service.start_datetime).toLocaleString()}</td>
                                    <td>{new Date(service.end_datetime).toLocaleString()}</td>
                                    <td>
                                        <span className={`status-badge status-${service.status.toLowerCase()}`}>
                                            {service.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            {(service.status === 'DRAFT' || service.status === 'REQUESTED') && (
                                                <button className="btn-small" onClick={() => handleAction(service.id, 'approve')}>Approve</button>
                                            )}
                                            {service.status === 'APPROVED' && (
                                                <>
                                                    <button className="btn-small" onClick={() => handleAction(service.id, 'confirm')}>Confirm</button>
                                                    <button className="btn-small" onClick={() => handleAction(service.id, 'generate_duties')}>Gen Duties</button>
                                                </>
                                            )}
                                            {service.status === 'CONFIRMED' && (
                                                <>
                                                    <button className="btn-small" onClick={() => handleAction(service.id, 'generate_duties')}>Gen Duties</button>
                                                    <button className="btn-small" onClick={() => handleAction(service.id, 'complete')}>Complete</button>
                                                </>
                                            )}
                                            {service.status === 'COMPLETED' && (
                                                <button className="btn-small" onClick={() => handleAction(service.id, 'generate_invoice')}>Gen Invoice</button>
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
