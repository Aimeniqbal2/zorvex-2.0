import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { Employee, Designation, Department, EmployeeNextOfKin, EmployeeDocument, EmployeeTraining, EmploymentHistory } from '../types';
import { EmployeeLifecycleWorkspace } from './EmployeeLifecycleWorkspace';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onSave: () => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({ isOpen, onClose, employee, onSave }) => {
    const [activeModalTab, setActiveModalTab] = useState<'MASTER' | 'KIN' | 'DOCS' | 'TRAINING' | 'STATUTORY' | 'COMPENSATION' | 'HISTORY' | 'DEPLOYMENT'>('MASTER');
    const [currentDeployment, setCurrentDeployment] = useState<any | null>(null);
    const [deploymentHistory, setDeploymentHistory] = useState<any[]>([]);
    const [formData, setFormData] = useState<Partial<Employee>>({
        first_name: '',
        last_name: '',
        employee_code: '',
        email: '',
        phone: '',
        father_name: '',
        cnic_number: '',
        date_of_birth: '',
        hire_date: '',
        permanent_address: '',
        current_address: '',
        education: '',
        marital_status: 'SINGLE',
        classification: 'DIRECT',
        background_type: 'CIVILIAN',
        employment_status: 'ACTIVE',
        designation: '',
        department: '',
        is_active: true
    });

    const [designations, setDesignations] = useState<Designation[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    // Child Data States
    const [nextOfKinList, setNextOfKinList] = useState<EmployeeNextOfKin[]>([]);
    const [documentsList, setDocumentsList] = useState<EmployeeDocument[]>([]);
    const [trainingsList, setTrainingsList] = useState<EmployeeTraining[]>([]);
    const [, setHistoryList] = useState<EmploymentHistory[]>([]);

    // Form inputs for inline creation
    const [newKin, setNewKin] = useState({ name: '', relationship: '', contact_number: '', cnic_number: '', is_primary: true });
    const [newDoc, setNewDoc] = useState({ document_type: 'POLICE_VERIFICATION', document_number: '', notes: '' });
    const [newTraining, setNewTraining] = useState({ training_type: 'Basic Guard & Fire Safety', training_date: new Date().toISOString().split('T')[0], institute_or_trainer: '', status: 'COMPLETED' });
    const [compData, setCompData] = useState({ base_salary: '35000.00', single_ot_rate: '200.00', double_ot_rate: '400.00', effective_from: new Date().toISOString().split('T')[0] });

    useEffect(() => {
        if (employee) {
            setFormData({
                ...employee,
                designation: employee?.designation || '',
                department: employee?.department || '',
                joining_date: employee?.joining_date || employee?.hire_date || ''
            });
            fetchChildData(employee.id);
        } else {
            setFormData({
                first_name: '',
                last_name: '',
                email: '',
                phone: '',
                father_name: '',
                cnic_number: '',
                date_of_birth: '',
                hire_date: '',
                permanent_address: '',
                current_address: '',
                education: '',
                marital_status: 'SINGLE',
                classification: 'DIRECT',
                background_type: 'CIVILIAN',
                employment_status: 'ACTIVE',
                designation: '',
                department: '',
                is_active: true
            });
            setNextOfKinList([]);
            setDocumentsList([]);
            setTrainingsList([]);
            setHistoryList([]);
            setCurrentDeployment(null);
            setDeploymentHistory([]);
        }
        setError(null);
    }, [employee, isOpen]);

    useEffect(() => {
        if (isOpen) {
            apiClient.get('/api/hrm/designations/').then(res => setDesignations(res.data.results || (Array.isArray(res.data) ? res.data : []))).catch(() => setDesignations([]));
            apiClient.get('/api/hrm/departments/').then(res => setDepartments(res.data.results || (Array.isArray(res.data) ? res.data : []))).catch(() => setDepartments([]));
        }
    }, [isOpen]);

    const fetchChildData = async (empId: string) => {
        try {
            const [kinRes, docRes, trainRes, histRes, deployRes] = await Promise.all([
                apiClient.get(`/api/hrm/employee-next-of-kin/?employee=${empId}`),
                apiClient.get(`/api/hrm/employee-documents/?employee=${empId}`),
                apiClient.get(`/api/hrm/employee-trainings/?employee=${empId}`),
                apiClient.get(`/api/hrm/employment-history/?employee=${empId}`),
                apiClient.get(`/api/hrm/employees/${empId}/deployments/`).catch(() => ({ data: { current: null, history: [] } }))
            ]);
            setNextOfKinList(kinRes.data.results || kinRes.data || []);
            setDocumentsList(docRes.data.results || docRes.data || []);
            setTrainingsList(trainRes.data.results || trainRes.data || []);
            setHistoryList(histRes.data.results || histRes.data || []);
            setCurrentDeployment(deployRes.data?.current || null);
            setDeploymentHistory(deployRes.data?.history || []);
        } catch (e) {
            console.error("Failed to load employee details", e);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = { ...formData };
            if (!payload.designation) delete payload.designation;
            if (!payload.department) delete payload.department;

            if (employee?.id) {
                await apiClient.patch(`/api/hrm/employees/${employee.id}/`, payload);
            } else {
                await apiClient.post('/api/hrm/employees/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save employee');
        } finally {
            setLoading(false);
        }
    };

    const handleAddKin = async () => {
        if (!employee?.id || !newKin.name || !newKin.contact_number) return;
        try {
            await apiClient.post('/api/hrm/employee-next-of-kin/', {
                ...newKin,
                employee: employee.id
            });
            setNewKin({ name: '', relationship: '', contact_number: '', cnic_number: '', is_primary: true });
            fetchChildData(employee.id);
        } catch (e) {
            alert('Failed to add next of kin');
        }
    };

    const handleAddDoc = async () => {
        if (!employee?.id) return;
        try {
            await apiClient.post('/api/hrm/employee-documents/', {
                ...newDoc,
                employee: employee.id,
                verification_status: 'PENDING'
            });
            setNewDoc({ document_type: 'POLICE_VERIFICATION', document_number: '', notes: '' });
            fetchChildData(employee.id);
        } catch (e) {
            alert('Failed to upload document record');
        }
    };

    const handleVerifyDoc = async (docId: string) => {
        try {
            await apiClient.post(`/api/hrm/employee-documents/${docId}/verify/`, {
                verification_status: 'VERIFIED',
                notes: 'Verified by HR Administrator'
            });
            if (employee) fetchChildData(employee.id);
        } catch (e) {
            alert('Failed to verify document');
        }
    };

    const handleAddTraining = async () => {
        if (!employee?.id || !newTraining.training_type) return;
        try {
            await apiClient.post('/api/hrm/employee-trainings/', {
                ...newTraining,
                employee: employee.id
            });
            fetchChildData(employee.id);
        } catch (e) {
            alert('Failed to add training record');
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>;
        return (
            <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                ))}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} width="880px" title={employee ? `Workforce Master — ${employee.full_name || employee.first_name}` : 'Register New Employee / Guard'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', boxSizing: 'border-box' }}>
                {/* Modal Navigation Tabs */}
                {employee && (
                    <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', overflowX: 'auto' }}>
                        {[
                            { id: 'MASTER', label: 'Master Data' },
                            { id: 'KIN', label: `Next of Kin (${nextOfKinList.length})` },
                            { id: 'DOCS', label: `Documents (${documentsList.length})` },
                            { id: 'TRAINING', label: `Training (${trainingsList.length})` },
                            { id: 'COMPENSATION', label: 'Compensation' },
                            { id: 'HISTORY', label: 'Lifecycle & History' },
                            { id: 'DEPLOYMENT', label: `Deployment (${currentDeployment ? 'Active' : 'Unassigned'})` },
                        ].map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveModalTab(t.id as any)}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: '6px 6px 0 0',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '12.5px',
                                    fontWeight: activeModalTab === t.id ? 600 : 500,
                                    background: activeModalTab === t.id ? 'var(--color-primary)' : 'transparent',
                                    color: activeModalTab === t.id ? '#fff' : 'var(--color-text)'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}

                {renderError()}

                {activeModalTab === 'MASTER' && (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', gap: '16px' }}>
                            <Input label="Employee Code" name="employee_code" value={formData.employee_code || ''} onChange={handleChange} placeholder="Auto (EMP-000001)" />
                            <div className="form-field">
                                <label className="form-label">Classification <span className="required">*</span></label>
                                <select 
                                    name="classification" 
                                    value={formData.classification || 'DIRECT'} 
                                    onChange={handleChange} 
                                    style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: 'var(--radius-md, 6px)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' }}
                                >
                                    <option value="DIRECT">DIRECT (Field Guard / Supervisor / CPO)</option>
                                    <option value="INDIRECT">INDIRECT (Office Staff / Management)</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label className="form-label">Employment Status</label>
                                <select 
                                    name="employment_status" 
                                    value={formData.employment_status || 'ACTIVE'} 
                                    onChange={handleChange} 
                                    style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: 'var(--radius-md, 6px)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' }}
                                >
                                    <option value="ACTIVE">ACTIVE</option>
                                    <option value="INACTIVE">INACTIVE</option>
                                    <option value="SUSPENDED">SUSPENDED</option>
                                    <option value="RESIGNED">RESIGNED</option>
                                    <option value="TERMINATED">TERMINATED</option>
                                    <option value="JUMP">JUMP / MISSING</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                            <Input label="First Name" name="first_name" value={formData.first_name || ''} onChange={handleChange} required />
                            <Input label="Last Name" name="last_name" value={formData.last_name || ''} onChange={handleChange} required />
                            <Input label="Father's Name" name="father_name" value={formData.father_name || ''} onChange={handleChange} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px' }}>
                            <Input label="CNIC Number (13 digits)" name="cnic_number" value={formData.cnic_number || ''} onChange={handleChange} placeholder="35202-XXXXXXX-X" />
                            <Input label="Date of Birth" type="date" name="date_of_birth" value={formData.date_of_birth || ''} onChange={handleChange} />
                            <Input label="Joining Date" type="date" name="hire_date" value={formData.hire_date || ''} onChange={handleChange} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '16px' }}>
                            <Input label="Phone" name="phone" value={formData.phone || ''} onChange={handleChange} placeholder="0300-XXXXXXX" />
                            <Input label="Email" type="email" name="email" value={formData.email || ''} onChange={handleChange} placeholder="guard@example.com" />
                            <Input label="Education / Qualifications" name="education" value={formData.education || ''} onChange={handleChange} placeholder="e.g. Matric / F.A / Ex-Serviceman" />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                            <div className="form-field">
                                <label className="form-label">Background Type</label>
                                <select 
                                    name="background_type" 
                                    value={formData.background_type || 'CIVILIAN'} 
                                    onChange={handleChange} 
                                    style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: 'var(--radius-md, 6px)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' }}
                                >
                                    <option value="CIVILIAN">Civilian</option>
                                    <option value="EX_ARMY">Ex-Army / Ex-Military</option>
                                    <option value="OTHER">Other Service</option>
                                </select>
                            </div>

                            <div className="form-field">
                                <label className="form-label">Designation <span className="required">*</span></label>
                                <select 
                                    name="designation" 
                                    value={formData.designation || ''} 
                                    onChange={handleChange} 
                                    style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: 'var(--radius-md, 6px)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' }}
                                    required
                                >
                                    <option value="">-- Select Designation --</option>
                                    {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>

                            <div className="form-field">
                                <label className="form-label">Department</label>
                                <select 
                                    name="department" 
                                    value={formData.department || ''} 
                                    onChange={handleChange} 
                                    style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: 'var(--radius-md, 6px)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' }}
                                >
                                    <option value="">-- Select Department --</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-field">
                                <label className="form-label">Permanent Address</label>
                                <textarea 
                                    name="permanent_address" 
                                    rows={2} 
                                    value={formData.permanent_address || ''} 
                                    onChange={handleChange} 
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md, 6px)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} 
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-label">Current Address</label>
                                <textarea 
                                    name="current_address" 
                                    rows={2} 
                                    value={formData.current_address || ''} 
                                    onChange={handleChange} 
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md, 6px)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} 
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                            <Button type="submit" variant="primary" loading={loading}>Save Employee Master</Button>
                        </div>
                    </form>
                )}

                {activeModalTab === 'KIN' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <h4>Next of Kin Records</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                    <th style={{ padding: '8px' }}>Name</th>
                                    <th style={{ padding: '8px' }}>Relationship</th>
                                    <th style={{ padding: '8px' }}>Contact</th>
                                    <th style={{ padding: '8px' }}>CNIC</th>
                                    <th style={{ padding: '8px' }}>Primary</th>
                                </tr>
                            </thead>
                            <tbody>
                                {nextOfKinList.map(kin => (
                                    <tr key={kin.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '8px', fontWeight: 600 }}>{kin.name}</td>
                                        <td style={{ padding: '8px' }}>{kin.relationship}</td>
                                        <td style={{ padding: '8px' }}>{kin.contact_number}</td>
                                        <td style={{ padding: '8px' }}>{kin.cnic_number || '—'}</td>
                                        <td style={{ padding: '8px' }}>{kin.is_primary ? <span className="badge badge-success">✓ Primary</span> : 'No'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <h5 style={{ margin: '0 0 10px 0' }}>Add Next of Kin</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                                <input placeholder="Full Name" value={newKin.name} onChange={e => setNewKin({ ...newKin, name: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                                <input placeholder="Relationship (Father/Wife)" value={newKin.relationship} onChange={e => setNewKin({ ...newKin, relationship: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                                <input placeholder="Contact Number" value={newKin.contact_number} onChange={e => setNewKin({ ...newKin, contact_number: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                                <input placeholder="CNIC Number" value={newKin.cnic_number} onChange={e => setNewKin({ ...newKin, cnic_number: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                            </div>
                            <Button variant="primary" onClick={handleAddKin} style={{ marginTop: '10px' }}>Save Next of Kin</Button>
                        </div>
                    </div>
                )}

                {activeModalTab === 'DOCS' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <h4>Verification & Security Documents</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                    <th style={{ padding: '8px' }}>Document Type</th>
                                    <th style={{ padding: '8px' }}>Doc Number</th>
                                    <th style={{ padding: '8px' }}>Verification Status</th>
                                    <th style={{ padding: '8px' }}>Verified By</th>
                                    <th style={{ padding: '8px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documentsList.map(doc => (
                                    <tr key={doc.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '8px', fontWeight: 600 }}>{doc.document_type_display || doc.document_type}</td>
                                        <td style={{ padding: '8px' }}>{doc.document_number || '—'}</td>
                                        <td style={{ padding: '8px' }}>
                                            <span className={`badge ${doc.verification_status === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>
                                                {doc.verification_status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px' }}>{doc.verified_by_name || '—'}</td>
                                        <td style={{ padding: '8px' }}>
                                            {doc.verification_status !== 'VERIFIED' && (
                                                <Button variant="secondary" onClick={() => handleVerifyDoc(doc.id)}>Verify</Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <h5 style={{ margin: '0 0 10px 0' }}>Register Document</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <select value={newDoc.document_type} onChange={e => setNewDoc({ ...newDoc, document_type: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                                    <option value="CNIC">CNIC</option>
                                    <option value="POLICE_VERIFICATION">Police Verification</option>
                                    <option value="CRO">Criminal Records Office (CRO)</option>
                                    <option value="FINGERPRINT">Fingerprint Record</option>
                                    <option value="EMPLOYMENT_CONTRACT">Employment Contract</option>
                                    <option value="TRAINING_CERTIFICATE">Training Certificate</option>
                                    <option value="EX_ARMY_DOCUMENT">Ex-Army Discharge Record</option>
                                </select>
                                <input placeholder="Document Number / Ref" value={newDoc.document_number} onChange={e => setNewDoc({ ...newDoc, document_number: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                            </div>
                            <Button variant="primary" onClick={handleAddDoc} style={{ marginTop: '10px' }}>Register Document</Button>
                        </div>
                    </div>
                )}

                {activeModalTab === 'TRAINING' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <h4>Security & Tactical Training Records</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                    <th style={{ padding: '8px' }}>Training Course</th>
                                    <th style={{ padding: '8px' }}>Date</th>
                                    <th style={{ padding: '8px' }}>Institute / Trainer</th>
                                    <th style={{ padding: '8px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trainingsList.map(t => (
                                    <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '8px', fontWeight: 600 }}>{t.training_type}</td>
                                        <td style={{ padding: '8px' }}>{t.training_date}</td>
                                        <td style={{ padding: '8px' }}>{t.institute_or_trainer || '—'}</td>
                                        <td style={{ padding: '8px' }}><span className="badge badge-success">{t.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <h5 style={{ margin: '0 0 10px 0' }}>Add Training Record</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                <input placeholder="Training Course Name" value={newTraining.training_type} onChange={e => setNewTraining({ ...newTraining, training_type: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                                <input type="date" value={newTraining.training_date} onChange={e => setNewTraining({ ...newTraining, training_date: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                                <input placeholder="Institute / Trainer Name" value={newTraining.institute_or_trainer} onChange={e => setNewTraining({ ...newTraining, institute_or_trainer: e.target.value })} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                            </div>
                            <Button variant="primary" onClick={handleAddTraining} style={{ marginTop: '10px' }}>Log Completed Training</Button>
                        </div>
                    </div>
                )}

                {activeModalTab === 'COMPENSATION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <h4>Compensation Baseline & Overtime Rates</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <Input label="Base Salary (PKR)" value={compData.base_salary} onChange={e => setCompData({ ...compData, base_salary: e.target.value })} />
                            <Input label="Single OT Hourly Rate" value={compData.single_ot_rate} onChange={e => setCompData({ ...compData, single_ot_rate: e.target.value })} />
                            <Input label="Double OT Hourly Rate" value={compData.double_ot_rate} onChange={e => setCompData({ ...compData, double_ot_rate: e.target.value })} />
                            <Input label="Effective From" type="date" value={compData.effective_from} onChange={e => setCompData({ ...compData, effective_from: e.target.value })} />
                        </div>
                    </div>
                )}

                {activeModalTab === 'HISTORY' && employee && (
                    <EmployeeLifecycleWorkspace
                        employee={employee}
                        designations={designations}
                        departments={departments}
                        onRefresh={() => {
                            if (employee?.id) {
                                fetchChildData(employee.id);
                            }
                            onSave();
                        }}
                    />
                )}

                {activeModalTab === 'DEPLOYMENT' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <h4 style={{ margin: '0 0 12px 0' }}>Current Security Deployment</h4>
                            {currentDeployment ? (
                                <div style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                    gap: '12px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Site</div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{currentDeployment.site_name}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Post</div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{currentDeployment.post_name || 'General Site Assignment'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Client</div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{currentDeployment.client_name || '—'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Assignment Type</div>
                                        <div style={{ marginTop: '2px' }}>
                                            <span className={`badge ${currentDeployment.assignment_type === 'TEMPORARY' ? 'badge-warning' : 'badge-primary'}`}>
                                                {currentDeployment.assignment_type || 'PERMANENT'}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Effective Period</div>
                                        <div style={{ fontSize: '13px' }}>
                                            {currentDeployment.start_date || currentDeployment.effective_from}
                                            {currentDeployment.end_date ? ` to ${currentDeployment.end_date}` : ' (Ongoing)'}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Status</div>
                                        <div style={{ marginTop: '2px' }}>
                                            <span className="badge badge-success">ACTIVE</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    padding: '24px',
                                    textAlign: 'center',
                                    background: 'var(--color-surface)',
                                    borderRadius: '8px',
                                    border: '1px dashed var(--color-border)',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    No active deployment currently assigned to this employee.
                                </div>
                            )}
                        </div>

                        <div>
                            <h4 style={{ margin: '16px 0 8px 0' }}>Deployment History</h4>
                            {deploymentHistory.length === 0 ? (
                                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No past deployment records found.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                            <th style={{ padding: '8px' }}>Period</th>
                                            <th style={{ padding: '8px' }}>Site</th>
                                            <th style={{ padding: '8px' }}>Post</th>
                                            <th style={{ padding: '8px' }}>Type</th>
                                            <th style={{ padding: '8px' }}>Status</th>
                                            <th style={{ padding: '8px' }}>Relieved</th>
                                            <th style={{ padding: '8px' }}>Reason / Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deploymentHistory.map((d: any) => (
                                            <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '8px' }}>
                                                    {d.start_date || d.effective_from}
                                                    {d.end_date ? ` → ${d.end_date}` : ' (Ongoing)'}
                                                </td>
                                                <td style={{ padding: '8px', fontWeight: 600 }}>{d.site_name}</td>
                                                <td style={{ padding: '8px' }}>{d.post_name || '—'}</td>
                                                <td style={{ padding: '8px' }}>
                                                    <span className={`badge ${d.assignment_type === 'TEMPORARY' ? 'badge-warning' : 'badge-secondary'}`}>
                                                        {d.assignment_type || 'PERMANENT'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <span className={`badge ${d.status === 'ACTIVE' ? 'badge-success' : d.status === 'RELIEVED' ? 'badge-warning' : 'badge-secondary'}`}>
                                                        {d.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px' }}>{d.relieved_date || '—'}</td>
                                                <td style={{ padding: '8px', color: 'var(--color-text-secondary)' }}>
                                                    {d.relief_reason || d.notes || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
