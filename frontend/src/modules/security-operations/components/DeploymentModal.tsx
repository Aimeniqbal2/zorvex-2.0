import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { Deployment, OperationalSite, ServiceContract, DesignationOption, EmployeeOption } from '../types';

interface DeploymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    deployment: Deployment | null;
}

const DEPLOYMENT_STATUSES = ['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

export const DeploymentModal: React.FC<DeploymentModalProps> = ({
    isOpen, onClose, onSave, deployment
}) => {
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [designations, setDesignations] = useState<DesignationOption[]>([]);
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [empSearch, setEmpSearch] = useState('');
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    const [formData, setFormData] = useState<Partial<Deployment>>({
        employee: '',
        site: '',
        service_contract: null,
        designation: '',
        start_date: '',
        end_date: null,
        status: 'DRAFT',
        notes: '',
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | Record<string, string[]> | null>(null);
    const [siteContracts, setSiteContracts] = useState<ServiceContract[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchStaticData();
            if (deployment) {
                setFormData({
                    employee: deployment.employee,
                    site: deployment.site,
                    service_contract: deployment.service_contract,
                    designation: deployment.designation,
                    start_date: deployment.start_date,
                    end_date: deployment.end_date,
                    status: deployment.status,
                    notes: deployment.notes || '',
                });
                fetchContractsForSite(deployment.site);
                fetchEmployeesDebounced('');
            } else {
                setFormData({
                    employee: '',
                    site: '',
                    service_contract: null,
                    designation: '',
                    start_date: '',
                    end_date: null,
                    status: 'DRAFT',
                    notes: '',
                });
                setSiteContracts([]);
            }
            setError(null);
        }
    }, [isOpen, deployment]);

    const fetchStaticData = async () => {
        try {
            const [sitesRes, desigRes] = await Promise.all([
                apiClient.get('/api/operations/sites/?is_active=true&page_size=200'),
                apiClient.get('/api/hrm/designations/?is_active=true&page_size=200'),
            ]);
            setSites(sitesRes.data.results || sitesRes.data);
            setDesignations(desigRes.data.results || desigRes.data);
        } catch (err) {
            console.error('Failed to fetch static data', err);
        }
    };

    const fetchContractsForSite = async (siteId: string) => {
        if (!siteId) { setSiteContracts([]); return; }
        try {
            const res = await apiClient.get(`/api/operations/contracts/?status=ACTIVE&page_size=100`);
            const all: ServiceContract[] = res.data.results || res.data;
            // Filter to contracts that include this site
            setSiteContracts(all.filter(c => c.sites?.includes(siteId)));
        } catch (err) {
            setSiteContracts([]);
        }
    };

    const fetchEmployeesDebounced = async (search: string) => {
        setLoadingEmployees(true);
        try {
            const desig = formData.designation;
            const params = new URLSearchParams({ is_active: 'true', page_size: '50' });
            if (search) params.set('search', search);
            if (desig) params.set('designation', desig);
            const res = await apiClient.get(`/api/hrm/employees/?${params}`);
            setEmployees(res.data.results || res.data);
        } catch (err) {
            console.error('Failed to fetch employees', err);
        } finally {
            setLoadingEmployees(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(() => {
            if (isOpen) fetchEmployeesDebounced(empSearch);
        }, 400);
        return () => clearTimeout(t);
    }, [empSearch, formData.designation, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value || null }));

        if (name === 'site') {
            fetchContractsForSite(value);
            setFormData(prev => ({ ...prev, site: value, service_contract: null }));
        }
        if (name === 'designation') {
            setFormData(prev => ({ ...prev, designation: value, employee: '' }));
            fetchEmployeesDebounced(empSearch);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const payload = {
            ...formData,
            end_date: formData.end_date || null,
            service_contract: formData.service_contract || null,
        };

        try {
            if (deployment?.id) {
                await apiClient.patch(`/api/operations/deployments/${deployment.id}/`, payload);
            } else {
                await apiClient.post('/api/operations/deployments/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            setError(errData || 'Failed to save deployment');
        } finally {
            setLoading(false);
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div className="text-red-500 text-sm mb-3">{error}</div>;
        return (
            <div className="text-red-500 text-sm mb-3">
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join(', ') : String(v)}</div>
                ))}
            </div>
        );
    };

    const isEditActive = deployment?.status === 'ACTIVE';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={deployment ? 'Edit Deployment' : 'New Deployment'}>
            <form onSubmit={handleSubmit} className="space-y-4 p-4" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                {renderError()}

                {isEditActive && (
                    <div className="text-amber-600 text-sm bg-amber-50 p-2 rounded">
                        ⚠️ Active deployment: employee, site, and designation cannot be changed.
                    </div>
                )}

                {/* Designation first — filters employee list */}
                <div className="form-field">
                    <label className="form-label">Designation <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <select
                        name="designation"
                        value={formData.designation || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                        disabled={isEditActive}
                    >
                        <option value="">Select Designation</option>
                        {designations.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>

                {/* Employee search */}
                <div className="form-field">
                    <label className="form-label">Employee <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={empSearch}
                        onChange={e => setEmpSearch(e.target.value)}
                        className="input-base"
                        style={{ marginBottom: '8px' }}
                        disabled={isEditActive}
                    />
                    <select
                        name="employee"
                        value={formData.employee || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                        size={4}
                        disabled={isEditActive}
                    >
                        <option value="">-- Select --</option>
                        {loadingEmployees && <option disabled>Loading...</option>}
                        {employees.map(e => (
                            <option key={e.id} value={e.id}>
                                {e.first_name} {e.last_name}{e.employee_code ? ` (${e.employee_code})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Site */}
                <div className="form-field">
                    <label className="form-label">Site <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <select
                        name="site"
                        value={formData.site || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                        disabled={isEditActive}
                    >
                        <option value="">Select Site</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>

                {/* Contract — optional, filtered to site */}
                <div className="form-field">
                    <label className="form-label">Service Contract (optional)</label>
                    <select
                        name="service_contract"
                        value={formData.service_contract || ''}
                        onChange={handleChange}
                        className="input-base"
                    >
                        <option value="">None</option>
                        {siteContracts.map(c => (
                            <option key={c.id} value={c.id}>{c.contract_code}</option>
                        ))}
                        {siteContracts.length === 0 && formData.site && (
                            <option disabled>No active contracts for this site</option>
                        )}
                    </select>
                </div>

                {/* Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input
                        label="Start Date *"
                        type="date"
                        name="start_date"
                        value={formData.start_date || ''}
                        onChange={handleChange}
                        required
                    />
                    <Input
                        label="End Date"
                        type="date"
                        name="end_date"
                        value={formData.end_date || ''}
                        onChange={handleChange}
                    />
                </div>

                {/* Status */}
                <div className="form-field">
                    <label className="form-label">Status</label>
                    <select
                        name="status"
                        value={formData.status || 'DRAFT'}
                        onChange={handleChange}
                        className="input-base"
                    >
                        {DEPLOYMENT_STATUSES.map(s => (
                            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                        ))}
                    </select>
                </div>

                {/* Notes */}
                <div className="form-field">
                    <label className="form-label">Notes</label>
                    <textarea
                        name="notes"
                        value={formData.notes || ''}
                        onChange={handleChange}
                        className="input-base"
                        rows={2}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>
                        {deployment ? 'Save Changes' : 'Create Deployment'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
