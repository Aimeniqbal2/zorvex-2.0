import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { Employee, Designation, Department, EmployeeNextOfKin, EmployeeDocument, EmployeeTraining, EmployeeReference } from '../types';
import { EmployeeLifecycleWorkspace } from './EmployeeLifecycleWorkspace';
import { useIndustry } from '../../../stores/appStore';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onSave: () => void;
    isSecurity?: boolean;
}

type ModalTabId = 
    | 'GENERAL' 
    | 'PERSONAL' 
    | 'VERIFICATION' 
    | 'DOCS_TRAINING' 
    | 'STATUTORY' 
    | 'COMPENSATION' 
    | 'PAYMENT' 
    | 'DEPLOYMENT' 
    | 'LIFECYCLE';

export const EmployeeModal: React.FC<EmployeeModalProps> = ({ 
    isOpen, 
    onClose, 
    employee, 
    onSave,
    isSecurity: isSecurityProp
}) => {
    const { isSecurity: industryIsSecurity } = useIndustry();
    const isSecurity = isSecurityProp ?? industryIsSecurity;

    const [activeModalTab, setActiveModalTab] = useState<ModalTabId>('GENERAL');
    const [currentDeployment, setCurrentDeployment] = useState<any | null>(null);
    const [deploymentHistory, setDeploymentHistory] = useState<any[]>([]);
    
    // Photograph State
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState(false);
    const [photoFallback, setPhotoFallback] = useState(false);

    const getPhotoUrl = (photo: string | null | undefined): string | null => {
        if (!photo || photo === 'null' || photo === 'undefined' || photo === 'None' || photo === '1') return null;
        if (photo.startsWith('http://') || photo.startsWith('https://') || photo.startsWith('data:')) return photo;
        if (photo.startsWith('/')) return photo;
        return `/media/${photo}`;
    };

    // Form Data
    const [formData, setFormData] = useState<Partial<Employee>>({
        first_name: '',
        last_name: '',
        employee_code: '',
        previous_employee_code: '',
        father_name: '',
        gender: 'MALE',
        date_of_birth: '',
        place_of_birth: '',
        marital_status: 'SINGLE',
        children_male: 0,
        children_female: 0,
        caste: '',
        cnic_number: '',
        cnic_issue_date: '',
        cnic_expiry_date: '',
        phone: '',
        telephone_number: '',
        email: '',
        current_address: '',
        permanent_address: '',
        joining_date: '',
        hire_date: '',
        confirmation_date: '',
        designation: '',
        department: '',
        classification: isSecurity ? 'DIRECT' : 'INDIRECT',
        background_type: 'CIVILIAN',
        employment_status: 'ACTIVE',
        is_active: true,
        eobi_number: '',
        sessi_number: '',
        insurance_policy_number: '',
        ntn_number: '',
        is_guard_vaccine: false,
        is_guard_apsa_verified: false,
        visible_for_activity: true,
        payment_method: 'BANK_TRANSFER',
        bank_name: '',
        account_title: '',
        account_number: '',
        iban: '',
        wallet_provider: '',
        wallet_number: ''
    });

    const [designations, setDesignations] = useState<Designation[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    // Child Data States
    const [nextOfKinList, setNextOfKinList] = useState<EmployeeNextOfKin[]>([]);
    const [documentsList, setDocumentsList] = useState<EmployeeDocument[]>([]);
    const [referencesList, setReferencesList] = useState<EmployeeReference[]>([]);
    const [trainingsList, setTrainingsList] = useState<EmployeeTraining[]>([]);

    // Form inputs for inline creation
    const [newKin, setNewKin] = useState({ name: '', relationship: '', contact_number: '', cnic_number: '', is_primary: true });
    const [newDoc, setNewDoc] = useState({ document_type: 'POLICE_VERIFICATION', document_number: '', notes: '' });
    const [newRef, setNewRef] = useState({ name: '', relationship: '', contact_number: '', cnic_number: '', address: '', remarks: '' });
    const [newTraining, setNewTraining] = useState({ training_type: 'Basic Guard & Fire Safety', training_date: new Date().toISOString().split('T')[0], institute_or_trainer: '', status: 'COMPLETED' });
    const [compData, setCompData] = useState({ base_salary: '35000.00', single_ot_rate: '200.00', double_ot_rate: '400.00', effective_from: new Date().toISOString().split('T')[0] });

    useEffect(() => {
        if (employee) {
            const prefPay = employee.preferred_payment_destination;
            setFormData({
                ...employee,
                designation: employee?.designation || '',
                department: employee?.department || '',
                joining_date: employee?.joining_date || employee?.hire_date || '',
                hire_date: employee?.hire_date || employee?.joining_date || '',
                payment_method: prefPay?.payment_method || 'BANK_TRANSFER',
                bank_name: prefPay?.bank_name || '',
                account_title: prefPay?.account_title || '',
                account_number: prefPay?.account_number || '',
                iban: prefPay?.iban || '',
                wallet_provider: prefPay?.wallet_provider || '',
                wallet_number: prefPay?.wallet_number || ''
            });
            setPhotoPreview(getPhotoUrl(employee.photograph));
            setPhotoError(false);
            setPhotoFallback(false);
            fetchChildData(employee.id);
        } else {
            setFormData({
                first_name: '',
                last_name: '',
                employee_code: '',
                previous_employee_code: '',
                father_name: '',
                gender: 'MALE',
                date_of_birth: '',
                place_of_birth: '',
                marital_status: 'SINGLE',
                children_male: 0,
                children_female: 0,
                caste: '',
                cnic_number: '',
                cnic_issue_date: '',
                cnic_expiry_date: '',
                phone: '',
                telephone_number: '',
                email: '',
                current_address: '',
                permanent_address: '',
                joining_date: new Date().toISOString().split('T')[0],
                hire_date: new Date().toISOString().split('T')[0],
                confirmation_date: '',
                designation: '',
                department: '',
                classification: isSecurity ? 'DIRECT' : 'INDIRECT',
                background_type: 'CIVILIAN',
                employment_status: 'ACTIVE',
                is_active: true,
                eobi_number: '',
                sessi_number: '',
                insurance_policy_number: '',
                ntn_number: '',
                is_guard_vaccine: false,
                is_guard_apsa_verified: false,
                visible_for_activity: true,
                payment_method: 'BANK_TRANSFER',
                bank_name: '',
                account_title: '',
                account_number: '',
                iban: '',
                wallet_provider: '',
                wallet_number: ''
            });
            setPhotoFile(null);
            setPhotoPreview(null);
            setNextOfKinList([]);
            setDocumentsList([]);
            setReferencesList([]);
            setTrainingsList([]);
            setCurrentDeployment(null);
            setDeploymentHistory([]);
        }
        setError(null);
        setActiveModalTab('GENERAL');
    }, [employee, isOpen, isSecurity]);

    useEffect(() => {
        if (!isSecurity && activeModalTab === 'DEPLOYMENT') {
            setActiveModalTab('GENERAL');
        }
    }, [isSecurity, activeModalTab]);

    useEffect(() => {
        if (isOpen) {
            apiClient.get('/api/hrm/designations/').then(res => setDesignations(res.data.results || (Array.isArray(res.data) ? res.data : []))).catch(() => setDesignations([]));
            apiClient.get('/api/hrm/departments/').then(res => setDepartments(res.data.results || (Array.isArray(res.data) ? res.data : []))).catch(() => setDepartments([]));
        }
    }, [isOpen]);

    const fetchChildData = async (empId: string) => {
        try {
            const promises: Promise<any>[] = [
                apiClient.get(`/api/hrm/employee-next-of-kin/?employee=${empId}`),
                apiClient.get(`/api/hrm/employee-documents/?employee=${empId}`),
                apiClient.get(`/api/hrm/employee-references/?employee=${empId}`),
                apiClient.get(`/api/hrm/employee-trainings/?employee=${empId}`),
            ];
            if (isSecurity) {
                promises.push(apiClient.get(`/api/hrm/employees/${empId}/deployments/`).catch(() => ({ data: { current: null, history: [] } })));
            }
            const results = await Promise.all(promises);
            setNextOfKinList(results[0].data.results || results[0].data || []);
            setDocumentsList(results[1].data.results || results[1].data || []);
            setReferencesList(results[2].data.results || results[2].data || []);
            setTrainingsList(results[3].data.results || results[3].data || []);
            if (isSecurity && results[4]) {
                setCurrentDeployment(results[4].data?.current || null);
                setDeploymentHistory(results[4].data?.history || []);
            } else {
                setCurrentDeployment(null);
                setDeploymentHistory([]);
            }
        } catch (e) {
            console.error("Failed to load employee details", e);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
            setPhotoError(false);
            setPhotoFallback(false);
        }
    };

    const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.85): Promise<File> => {
        return new Promise((resolve) => {
            if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
                resolve(file);
                return;
            }
            const img = new Image();
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target?.result as string;
            };
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(file);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            resolve(file);
                            return;
                        }
                        const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                        const compressedFile = new File([blob], cleanName, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file);
            reader.readAsDataURL(file);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const payload: any = { ...formData };
            const fullNameVal = (payload.full_name || payload.name || payload.first_name || '').trim();
            payload.first_name = fullNameVal;
            payload.last_name = '';

            // Clean read-only, nested relation, and calculated fields from payload
            delete payload.full_name;
            delete payload.name;
            delete payload.photograph;
            delete payload.department_name;
            delete payload.designation_name;
            delete payload.age;
            delete payload.training_completed;
            delete payload.legacy_record;
            delete payload.documents;
            delete payload.trainings;
            delete payload.next_of_kin;
            delete payload.references;
            delete payload.history_logs;
            delete payload.architecture_state;
            delete payload.preferred_payment_destination;

            if (!payload.designation) delete payload.designation;
            if (!payload.department) delete payload.department;
            if (!payload.employee_code) delete payload.employee_code;
            if (!payload.date_of_birth) delete payload.date_of_birth;
            if (!payload.hire_date) delete payload.hire_date;
            if (!payload.joining_date) delete payload.joining_date;
            if (!payload.cnic_issue_date) delete payload.cnic_issue_date;
            if (!payload.cnic_expiry_date) delete payload.cnic_expiry_date;
            if (!payload.confirmation_date) delete payload.confirmation_date;

            // Handle multipart form if photo is selected
            if (photoFile) {
                // Compress image down to ~80KB-120KB so Nginx client_max_body_size is never exceeded
                const fileToUpload = await compressImage(photoFile);

                const fd = new FormData();
                Object.entries(payload).forEach(([k, v]) => {
                    if (v !== undefined && v !== null && v !== '') {
                        fd.append(k, String(v));
                    }
                });
                fd.append('photograph', fileToUpload);

                if (employee?.id) {
                    await apiClient.patch(`/api/hrm/employees/${employee.id}/`, fd);
                } else {
                    await apiClient.post('/api/hrm/employees/', fd);
                }
            } else {
                if (employee?.id) {
                    await apiClient.patch(`/api/hrm/employees/${employee.id}/`, payload);
                } else {
                    await apiClient.post('/api/hrm/employees/', payload);
                }
            }
            onSave();
            onClose();
        } catch (err: any) {
            console.error("Failed to save employee record:", err);
            const errData = err.response?.data;
            let msg = 'Failed to save employee record';
            if (typeof errData === 'string') {
                msg = errData;
            } else if (errData && typeof errData === 'object') {
                msg = errData.detail || errData.photograph || errData;
            } else if (err.message) {
                msg = err.message;
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // Reference handler
    const handleAddReference = async () => {
        if (!employee?.id || !newRef.name) return;
        try {
            await apiClient.post('/api/hrm/employee-references/', {
                ...newRef,
                employee: employee.id
            });
            setNewRef({ name: '', relationship: '', contact_number: '', cnic_number: '', address: '', remarks: '' });
            fetchChildData(employee.id);
        } catch (e) {
            alert('Failed to add reference person');
        }
    };

    const handleVerifyReference = async (refId: string) => {
        try {
            await apiClient.post(`/api/hrm/employee-references/${refId}/verify/`, {
                remarks: 'Verified by HR security vetting department'
            });
            if (employee) fetchChildData(employee.id);
        } catch (e) {
            alert('Failed to verify reference person');
        }
    };

    // Document handlers
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
                notes: 'Verified by HR Security Vetting Officer'
            });
            if (employee) fetchChildData(employee.id);
        } catch (e) {
            alert('Failed to verify document');
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

    const tabsList: { id: ModalTabId; label: string; icon: string; badge?: number | string }[] = [
        { id: 'GENERAL', label: 'General & Employment', icon: 'bx-briefcase' },
        { id: 'PERSONAL', label: 'Personal & Identity', icon: 'bx-user' },
        { id: 'VERIFICATION', label: 'Verification & References', icon: 'bx-shield-quarter', badge: referencesList.length },
        { id: 'DOCS_TRAINING', label: 'Training & Documents', icon: 'bx-file', badge: documentsList.length + trainingsList.length },
        { id: 'STATUTORY', label: 'Statutory & Insurance', icon: 'bx-building' },
        { id: 'COMPENSATION', label: 'Compensation', icon: 'bx-dollar-circle' },
        { id: 'PAYMENT', label: 'Payment Details', icon: 'bx-credit-card' },
        ...(isSecurity ? [{ id: 'DEPLOYMENT' as ModalTabId, label: 'Deployment & Shift', icon: 'bx-map-pin', badge: currentDeployment ? 'Active' : 'Unassigned' }] : []),
        ...(employee ? [{ id: 'LIFECYCLE' as ModalTabId, label: 'Lifecycle & History', icon: 'bx-history' }] : [])
    ];

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '14px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>;
        return (
            <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '14px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                ))}
            </div>
        );
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            width="min(1340px, 95vw)" 
            maxHeight="92vh"
            closeOnOverlayClick={false}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                        width: '38px', 
                        height: '38px', 
                        borderRadius: '8px', 
                        background: 'rgba(37, 99, 235, 0.1)', 
                        color: 'var(--color-primary)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: '20px'
                    }}>
                        <i className={isSecurity ? 'bx bx-shield-quarter' : 'bx bx-user'}></i>
                    </div>
                    <div>
                        <div style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
                            {isSecurity 
                                ? (employee ? `One Security Workforce Master — ${employee.full_name || employee.first_name} (${employee.previous_employee_code || employee.employee_code})` : 'Register New Guard / Staff — Master Profile')
                                : (employee ? `Employee Details — ${employee.full_name || employee.first_name} (${employee.employee_code})` : 'Add New Employee')
                            }
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 400, marginTop: '2px' }}>
                            {employee 
                                ? `Code: ${employee.previous_employee_code || employee.employee_code} • Department: ${employee.department_name || 'Unassigned'} • Designation: ${employee.designation_name || 'Staff'}` 
                                : 'Complete mandatory workforce details marked with red asterisk (*)'
                            }
                        </div>
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
                {/* 9 Segmented Tabs Navigation */}
                <div className="modal-tab-strip">
                    {tabsList.map((t, idx) => (
                        <button
                            key={t.id}
                            type="button"
                            className={`modal-tab-btn ${activeModalTab === t.id ? 'active' : ''}`}
                            onClick={() => setActiveModalTab(t.id)}
                        >
                            <i className={`bx ${t.icon}`}></i>
                            <span>{idx + 1}. {t.label}</span>
                            {t.badge !== undefined && <span className="modal-tab-badge">{t.badge}</span>}
                        </button>
                    ))}
                </div>

                {renderError()}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {/* TAB 1: GENERAL & EMPLOYMENT */}
                    {activeModalTab === 'GENERAL' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {/* Card 1: Codes & Workforce Type */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-barcode"></i> Employee Identification & Category
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                                    <Input label="System Code (Auto)" name="employee_code" value={formData.employee_code || ''} onChange={handleChange} placeholder="Auto (EMP-000001)" />
                                    <Input label="Legacy / Badge Code" name="previous_employee_code" value={formData.previous_employee_code || ''} onChange={handleChange} placeholder="e.g. 010404 (Leading zeros preserved)" />
                                    <div className="form-field">
                                        <label className="form-label">{isSecurity ? 'Workforce Classification' : 'Classification'} <span className="required">*</span></label>
                                        <select 
                                            className="modal-select"
                                            name="classification" 
                                            value={formData.classification || (isSecurity ? 'DIRECT' : 'INDIRECT')} 
                                            onChange={handleChange}
                                        >
                                            <option value="DIRECT">DIRECT (Field Guard / Supervisor / CPO)</option>
                                            <option value="INDIRECT">INDIRECT (Office Staff / Management)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Personnel Profile */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-user-pin"></i> Personnel Profile
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
                                    <Input 
                                        label="Full Name *" 
                                        name="first_name" 
                                        value={formData.first_name || (formData as any).full_name || (formData as any).name || ''} 
                                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value, last_name: '' })} 
                                        required 
                                        placeholder="e.g. Aamir Khan / Saif ur Rehman" 
                                    />
                                    <Input 
                                        label="Father / Husband Name" 
                                        name="father_name" 
                                        value={formData.father_name || ''} 
                                        onChange={handleChange} 
                                        placeholder="Father or husband name" 
                                    />
                                </div>
                            </div>

                            {/* Card 3: Organization & Placement */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-buildings"></i> Organization & Tenure
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '14px' }}>
                                    <div className="form-field">
                                        <label className="form-label">Designation <span className="required">*</span></label>
                                        <select 
                                            className="modal-select"
                                            name="designation" 
                                            value={formData.designation || ''} 
                                            onChange={handleChange} 
                                            required
                                        >
                                            <option value="">-- Select Designation --</option>
                                            {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-field">
                                        <label className="form-label">Department / Client Site</label>
                                        <select 
                                            className="modal-select"
                                            name="department" 
                                            value={formData.department || ''} 
                                            onChange={handleChange}
                                        >
                                            <option value="">-- Select Department / Site --</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-field">
                                        <label className="form-label">Background Type</label>
                                        <select 
                                            className="modal-select"
                                            name="background_type" 
                                            value={formData.background_type || 'CIVILIAN'} 
                                            onChange={handleChange}
                                        >
                                            <option value="CIVILIAN">Civilian</option>
                                            <option value="MILITARY">Ex-Army / Military</option>
                                            <option value="POLICE">Ex-Police / Law Enforcement</option>
                                            <option value="OTHER">Other Background</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                                    <Input label="Enrollment / Joining Date *" type="date" name="joining_date" value={formData.joining_date || ''} onChange={handleChange} required />
                                    <Input label="Confirmation Date" type="date" name="confirmation_date" value={formData.confirmation_date || ''} onChange={handleChange} />
                                    <div className="form-field">
                                        <label className="form-label">Employment Status</label>
                                        <select 
                                            className="modal-select"
                                            name="employment_status" 
                                            value={formData.employment_status || 'ACTIVE'} 
                                            onChange={handleChange}
                                        >
                                            <option value="ACTIVE">ACTIVE</option>
                                            <option value="INACTIVE">INACTIVE</option>
                                            <option value="SUSPENDED">SUSPENDED</option>
                                            <option value="RESIGNED">RESIGNED</option>
                                            <option value="TERMINATED">TERMINATED</option>
                                            {isSecurity && <option value="JUMP">JUMP / MISSING</option>}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Card 4 (Security Only): Clearances & Deployment Availability */}
                            {isSecurity && (
                                <div className="modal-form-card" style={{ background: 'rgba(37, 99, 235, 0.02)' }}>
                                    <div className="modal-form-card-title">
                                        <i className="bx bx-check-shield"></i> Security Clearances & Deployment Availability
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer' }}>
                                            <input type="checkbox" name="is_guard_vaccine" checked={!!formData.is_guard_vaccine} onChange={handleChange} style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>COVID / Medical Vaccine</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Verified immunization record</div>
                                            </div>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer' }}>
                                            <input type="checkbox" name="is_guard_apsa_verified" checked={!!formData.is_guard_apsa_verified} onChange={handleChange} style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>APSA Guard Verification</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Security Association vetted</div>
                                            </div>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer' }}>
                                            <input type="checkbox" name="visible_for_activity" checked={formData.visible_for_activity !== false} onChange={handleChange} style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>Visible For Operations</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Eligible for shift & site deployments</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: PERSONAL & IDENTITY */}
                    {activeModalTab === 'PERSONAL' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {/* Card 1: Photograph Upload & Preview */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-camera"></i> Official Photograph & Avatar
                                </div>
                                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ width: '100px', height: '110px', border: '2px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--color-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {photoPreview && !photoError ? (
                                            <img
                                                src={
                                                    photoFallback && photoPreview.includes('/media/hrm/employee_photos/')
                                                        ? photoPreview.replace('/media/hrm/employee_photos/', '/api/hrm/employee_photos/')
                                                        : photoPreview
                                                }
                                                alt={formData.first_name || 'Guard Photo'}
                                                onError={() => {
                                                    if (!photoFallback && photoPreview.includes('/media/hrm/employee_photos/')) {
                                                        setPhotoFallback(true);
                                                    } else {
                                                        setPhotoError(true);
                                                    }
                                                }}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                                <i className="bx bx-user" style={{ fontSize: '46px' }}></i>
                                                <span style={{ fontSize: '10.5px', marginTop: '2px', color: 'var(--color-text-muted)' }}>No Photo</span>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: '220px' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                            Upload High-Resolution Profile Photo
                                        </label>
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            onChange={handlePhotoChange} 
                                            style={{ fontSize: '12.5px', padding: '6px 0' }} 
                                        />
                                        <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                            Used across workforce badges, security rosters, attendance records, and printable reports. Formats: JPG, PNG, WEBP.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Demographics */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-id-card"></i> Demographics & Family Details
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '14px' }}>
                                    <div className="form-field">
                                        <label className="form-label">Gender</label>
                                        <select className="modal-select" name="gender" value={formData.gender || 'MALE'} onChange={handleChange}>
                                            <option value="MALE">Male</option>
                                            <option value="FEMALE">Female</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                    </div>
                                    <Input label="Date of Birth" type="date" name="date_of_birth" value={formData.date_of_birth || ''} onChange={handleChange} />
                                    <Input label="Place of Birth" name="place_of_birth" value={formData.place_of_birth || ''} onChange={handleChange} placeholder="e.g. Abbottabad / Karachi" />
                                    <Input label="Caste / Ethnicity" name="caste" value={formData.caste || ''} onChange={handleChange} placeholder="e.g. Jadoon / Rajput" />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                    <div className="form-field">
                                        <label className="form-label">Marital Status</label>
                                        <select className="modal-select" name="marital_status" value={formData.marital_status || 'SINGLE'} onChange={handleChange}>
                                            <option value="SINGLE">Single</option>
                                            <option value="MARRIED">Married</option>
                                            <option value="DIVORCED">Divorced</option>
                                            <option value="WIDOWED">Widowed</option>
                                        </select>
                                    </div>
                                    <Input label="Children (Male Count)" type="number" name="children_male" value={formData.children_male ?? 0} onChange={handleChange} />
                                    <Input label="Children (Female Count)" type="number" name="children_female" value={formData.children_female ?? 0} onChange={handleChange} />
                                </div>
                            </div>

                            {/* Card 3: National Identity (NADRA) */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-card"></i> National Identity & Verification (NADRA)
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                    <Input label="CNIC Number (13 Digits)" name="cnic_number" value={formData.cnic_number || ''} onChange={handleChange} placeholder="e.g. 45501-3990113-9" />
                                    <Input label="CNIC Issue Date" type="date" name="cnic_issue_date" value={formData.cnic_issue_date || ''} onChange={handleChange} />
                                    <Input label="CNIC Expiry Date" type="date" name="cnic_expiry_date" value={formData.cnic_expiry_date || ''} onChange={handleChange} />
                                </div>
                            </div>

                            {/* Card 4: Contact & Communication */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-phone-call"></i> Contact & Communications
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                    <Input label="Primary Mobile / Cell" name="phone" value={formData.phone || ''} onChange={handleChange} placeholder="03XXXXXXXXX" />
                                    <Input label="Secondary Landline / Tel" name="telephone_number" value={formData.telephone_number || ''} onChange={handleChange} placeholder="021-XXXXXXX" />
                                    <Input label="Email Address" type="email" name="email" value={formData.email || ''} onChange={handleChange} placeholder="guard@zorvexsecurity.com" />
                                </div>
                            </div>

                            {/* Card 5: Residential Addresses */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-map-pin"></i> Residential Addresses
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-field">
                                        <label className="form-label">Current / Correspondence Address</label>
                                        <textarea className="modal-textarea" name="current_address" rows={3} value={formData.current_address || ''} onChange={handleChange} placeholder="Current residential address..." />
                                    </div>
                                    <div className="form-field">
                                        <label className="form-label">Permanent Home Address</label>
                                        <textarea className="modal-textarea" name="permanent_address" rows={3} value={formData.permanent_address || ''} onChange={handleChange} placeholder="Permanent home / village address..." />
                                    </div>
                                </div>
                            </div>

                            {/* Card 6: Next of Kin */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-group"></i> Next of Kin / Emergency Contacts ({nextOfKinList.length})
                                </div>
                                {nextOfKinList.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                                        {nextOfKinList.map(k => (
                                            <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px' }}>
                                                <div>
                                                    <strong>{k.name}</strong> <span style={{ color: 'var(--color-text-muted)' }}>({k.relationship})</span>
                                                    <span style={{ marginLeft: '12px', color: 'var(--color-primary)', fontWeight: 500 }}>📞 {k.contact_number}</span>
                                                </div>
                                                <div>{k.is_primary ? <span className="badge badge-success">Primary Emergency Contact</span> : ''}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {employee && (
                                    <div style={{ padding: '14px', background: 'var(--color-surface-secondary)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '12.5px', marginBottom: '10px' }}>Add Next of Kin Record</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) auto', gap: '10px' }}>
                                            <input placeholder="Full Name *" value={newKin.name} onChange={e => setNewKin({ ...newKin, name: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '13px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="Relationship (e.g. Brother, Wife)" value={newKin.relationship} onChange={e => setNewKin({ ...newKin, relationship: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '13px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="Phone / Contact" value={newKin.contact_number} onChange={e => setNewKin({ ...newKin, contact_number: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '13px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <Button type="button" variant="primary" size="sm" onClick={handleAddKin}>Add Kin</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 3: VERIFICATION & REFERENCES */}
                    {activeModalTab === 'VERIFICATION' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {/* Card 1: Security Vetting Status Bar */}
                            <div className="modal-form-card" style={{ background: 'rgba(37, 99, 235, 0.03)' }}>
                                <div className="modal-form-card-title">
                                    <i className="bx bx-shield-quarter"></i> Security Vetting & Clearance Overview
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                                    <div style={{ padding: '12px', background: 'var(--color-surface)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Police Verification</div>
                                        <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>{documentsList.find(d => d.document_type === 'POLICE_VERIFICATION')?.verification_status || 'NOT SUBMITTED'}</div>
                                    </div>
                                    <div style={{ padding: '12px', background: 'var(--color-surface)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>CRO Check</div>
                                        <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>{documentsList.find(d => d.document_type === 'CRO')?.verification_status || 'NOT SUBMITTED'}</div>
                                    </div>
                                    <div style={{ padding: '12px', background: 'var(--color-surface)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>NADRA Verification</div>
                                        <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>{documentsList.find(d => d.document_type === 'NADRA_VERIFICATION')?.verification_status || 'PENDING'}</div>
                                    </div>
                                    <div style={{ padding: '12px', background: 'var(--color-surface)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>APSA Guard Status</div>
                                        <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px', color: formData.is_guard_apsa_verified ? 'var(--color-success)' : 'inherit' }}>
                                            {formData.is_guard_apsa_verified ? 'VERIFIED' : 'PENDING'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Reference Persons */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-user-check"></i> Reference Persons ({referencesList.length})
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: 'var(--color-surface-secondary)' }}>
                                            <th style={{ padding: '10px 12px' }}>Name</th>
                                            <th style={{ padding: '10px 12px' }}>Relationship</th>
                                            <th style={{ padding: '10px 12px' }}>Contact</th>
                                            <th style={{ padding: '10px 12px' }}>CNIC</th>
                                            <th style={{ padding: '10px 12px' }}>Status</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {referencesList.map(ref => (
                                            <tr key={ref.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{ref.name}</td>
                                                <td style={{ padding: '10px 12px' }}>{ref.relationship || '—'}</td>
                                                <td style={{ padding: '10px 12px' }}>{ref.contact_number}</td>
                                                <td style={{ padding: '10px 12px' }}>{ref.cnic_number || '—'}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span className={`badge ${ref.is_verified ? 'badge-success' : 'badge-warning'}`}>
                                                        {ref.is_verified ? `✓ Verified by ${ref.verified_by_name || 'HR'}` : 'Pending Verification'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                    {!ref.is_verified && (
                                                        <Button type="button" variant="secondary" size="sm" onClick={() => handleVerifyReference(ref.id)}>
                                                            Verify
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {referencesList.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                    No reference persons recorded yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {employee && (
                                    <div style={{ padding: '16px', background: 'var(--color-surface-secondary)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px' }}>Add Reference Person</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                                            <input placeholder="Full Name *" value={newRef.name} onChange={e => setNewRef({ ...newRef, name: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="Relationship" value={newRef.relationship} onChange={e => setNewRef({ ...newRef, relationship: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="Contact Number" value={newRef.contact_number} onChange={e => setNewRef({ ...newRef, contact_number: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="CNIC Number" value={newRef.cnic_number} onChange={e => setNewRef({ ...newRef, cnic_number: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <input placeholder="Residential Address" value={newRef.address} onChange={e => setNewRef({ ...newRef, address: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', flex: 1, background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="Vetting Remarks / Notes" value={newRef.remarks} onChange={e => setNewRef({ ...newRef, remarks: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', flex: 1, background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <Button type="button" variant="primary" size="sm" onClick={handleAddReference}>Save Reference</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 4: TRAINING & DOCUMENTS */}
                    {activeModalTab === 'DOCS_TRAINING' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {/* Card 1: Documents */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-file"></i> Verification Documents & Credentials ({documentsList.length})
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: 'var(--color-surface-secondary)' }}>
                                            <th style={{ padding: '10px 12px' }}>Document Type</th>
                                            <th style={{ padding: '10px 12px' }}>Ref / Number</th>
                                            <th style={{ padding: '10px 12px' }}>Status</th>
                                            <th style={{ padding: '10px 12px' }}>Verified By</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {documentsList.map(doc => (
                                            <tr key={doc.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{doc.document_type_display || doc.document_type}</td>
                                                <td style={{ padding: '10px 12px' }}>{doc.document_number || '—'}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span className={`badge ${doc.verification_status === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>
                                                        {doc.verification_status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>{doc.verified_by_name || '—'}</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                    {doc.verification_status !== 'VERIFIED' && (
                                                        <Button type="button" variant="secondary" size="sm" onClick={() => handleVerifyDoc(doc.id)}>
                                                            Verify
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {documentsList.length === 0 && (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                    No documents registered yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {employee && (
                                    <div style={{ padding: '16px', background: 'var(--color-surface-secondary)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px' }}>Register Document Record</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) auto', gap: '10px' }}>
                                            <select className="modal-select" value={newDoc.document_type} onChange={e => setNewDoc({ ...newDoc, document_type: e.target.value })}>
                                                <option value="POLICE_VERIFICATION">Police Verification</option>
                                                <option value="CRO">Criminal Records Office (CRO)</option>
                                                <option value="CNIC">CNIC Copy</option>
                                                <option value="NADRA_VERIFICATION">NADRA Verification Slip (Manual)</option>
                                                <option value="FINGERPRINT">Fingerprint Record</option>
                                                <option value="EMPLOYMENT_CONTRACT">Employment Contract</option>
                                                <option value="TRAINING_CERTIFICATE">Training Certificate</option>
                                                <option value="EX_ARMY_DOCUMENT">Ex-Army Discharge Record</option>
                                            </select>
                                            <input placeholder="Document # / Ref" value={newDoc.document_number} onChange={e => setNewDoc({ ...newDoc, document_number: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="Notes / Issuing Authority" value={newDoc.notes} onChange={e => setNewDoc({ ...newDoc, notes: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <Button type="button" variant="primary" size="sm" onClick={handleAddDoc}>Add Doc</Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card 2: Training Log */}
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-award"></i> Guard Training History ({trainingsList.length})
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: 'var(--color-surface-secondary)' }}>
                                            <th style={{ padding: '10px 12px' }}>Course / Training</th>
                                            <th style={{ padding: '10px 12px' }}>Date</th>
                                            <th style={{ padding: '10px 12px' }}>Trainer / Institute</th>
                                            <th style={{ padding: '10px 12px' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trainingsList.map(t => (
                                            <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.training_type}</td>
                                                <td style={{ padding: '10px 12px' }}>{t.training_date}</td>
                                                <td style={{ padding: '10px 12px' }}>{t.institute_or_trainer || '—'}</td>
                                                <td style={{ padding: '10px 12px' }}><span className="badge badge-success">{t.status}</span></td>
                                            </tr>
                                        ))}
                                        {trainingsList.length === 0 && (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                    No training history logged yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {employee && (
                                    <div style={{ padding: '16px', background: 'var(--color-surface-secondary)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px' }}>Log Completed Training Record</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) auto', gap: '10px' }}>
                                            <input placeholder="Course (e.g. Weapon Safety / Fire Drill)" value={newTraining.training_type} onChange={e => setNewTraining({ ...newTraining, training_type: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input type="date" value={newTraining.training_date} onChange={e => setNewTraining({ ...newTraining, training_date: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <input placeholder="Trainer / Academy Name" value={newTraining.institute_or_trainer} onChange={e => setNewTraining({ ...newTraining, institute_or_trainer: e.target.value })} style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                                            <Button type="button" variant="primary" size="sm" onClick={handleAddTraining}>Log Training</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 5: STATUTORY & INSURANCE */}
                    {activeModalTab === 'STATUTORY' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-building"></i> Statutory Registrations & Social Security
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                    <Input label="EOBI Registration Number" name="eobi_number" value={formData.eobi_number || ''} onChange={handleChange} placeholder="e.g. EOBI-12345678" />
                                    <Input label="SESSI / PESSI Registration Number" name="sessi_number" value={formData.sessi_number || ''} onChange={handleChange} placeholder="e.g. SESSI-87654321" />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <Input label="Group Insurance Policy Number" name="insurance_policy_number" value={formData.insurance_policy_number || ''} onChange={handleChange} placeholder="e.g. INS-POL-99221" />
                                    <Input label="NTN Number (National Tax)" name="ntn_number" value={formData.ntn_number || ''} onChange={handleChange} placeholder="e.g. 1234567-8" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 6: COMPENSATION */}
                    {activeModalTab === 'COMPENSATION' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-money"></i> Salary Structure & Overtime Baselines
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                    <Input label="Base Monthly Salary (PKR)" value={compData.base_salary} onChange={e => setCompData({ ...compData, base_salary: e.target.value })} placeholder="e.g. 35000" />
                                    <Input label="Effective Date" type="date" value={compData.effective_from} onChange={e => setCompData({ ...compData, effective_from: e.target.value })} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <Input label="Single Overtime Hourly Rate (PKR)" value={compData.single_ot_rate} onChange={e => setCompData({ ...compData, single_ot_rate: e.target.value })} placeholder="e.g. 150" />
                                    <Input label="Double Overtime Hourly Rate (PKR)" value={compData.double_ot_rate} onChange={e => setCompData({ ...compData, double_ot_rate: e.target.value })} placeholder="e.g. 300" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 7: PAYMENT DETAILS (S-4G Finance Sync) */}
                    {activeModalTab === 'PAYMENT' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-credit-card"></i> Disbursement Destination (S-4G Finance)
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                    <div className="form-field">
                                        <label className="form-label">Disbursement Mode</label>
                                        <select className="modal-select" name="payment_method" value={formData.payment_method || 'BANK_TRANSFER'} onChange={handleChange}>
                                            <option value="BANK_TRANSFER">Bank Transfer</option>
                                            <option value="WALLET">Mobile Wallet (Easypaisa / JazzCash)</option>
                                            <option value="CASH">Cash Counter / Field Disbursal</option>
                                            <option value="CHEQUE">Cheque</option>
                                        </select>
                                    </div>
                                    <Input label="Account Title" name="account_title" value={formData.account_title || ''} onChange={handleChange} placeholder="e.g. Saad Khan Jadoon" />
                                </div>

                                {formData.payment_method === 'BANK_TRANSFER' && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                            <Input label="Bank Name" name="bank_name" value={formData.bank_name || ''} onChange={handleChange} placeholder="e.g. Habib Bank Limited" />
                                            <Input label="Account Number" name="account_number" value={formData.account_number || ''} onChange={handleChange} placeholder="e.g. 01234567890123" />
                                        </div>
                                        <Input label="IBAN (24 Characters)" name="iban" value={formData.iban || ''} onChange={handleChange} placeholder="PK36HABB0000123456789012" />
                                    </>
                                )}

                                {formData.payment_method === 'WALLET' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div className="form-field">
                                            <label className="form-label">Wallet Provider</label>
                                            <select className="modal-select" name="wallet_provider" value={formData.wallet_provider || 'JAZZCASH'} onChange={handleChange}>
                                                <option value="JAZZCASH">JazzCash</option>
                                                <option value="EASYPAISA">Easypaisa</option>
                                                <option value="NAYAPAY">NayaPay</option>
                                                <option value="SADAPAY">SadaPay</option>
                                                <option value="OTHER">Other Wallet</option>
                                            </select>
                                        </div>
                                        <Input label="Wallet Mobile Number" name="wallet_number" value={formData.wallet_number || ''} onChange={handleChange} placeholder="03XXXXXXXXX" />
                                    </div>
                                )}

                                {formData.payment_method === 'CASH' && (
                                    <div style={{ padding: '14px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', fontSize: '13px', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        Salary disbursed directly via cash counter or field site supervisor with signed paper receipt.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 8: DEPLOYMENT & SHIFT (Security Only) */}
                    {activeModalTab === 'DEPLOYMENT' && isSecurity && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <div className="modal-form-card">
                                <div className="modal-form-card-title">
                                    <i className="bx bx-shield"></i> Current Active Deployment
                                </div>
                                {currentDeployment ? (
                                    <div style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', fontSize: '13.5px' }}>
                                        <div><span style={{ color: 'var(--color-text-muted)' }}>Site:</span> <strong>{currentDeployment.site_name}</strong></div>
                                        <div><span style={{ color: 'var(--color-text-muted)' }}>Post:</span> <strong>{currentDeployment.post_name || 'General Post'}</strong></div>
                                        <div><span style={{ color: 'var(--color-text-muted)' }}>Client:</span> <strong>{currentDeployment.client_name || '—'}</strong></div>
                                        <div><span style={{ color: 'var(--color-text-muted)' }}>Effective:</span> <strong>{currentDeployment.start_date || '—'}</strong></div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '20px', background: 'var(--color-surface-secondary)', borderRadius: '6px', border: '1px dashed var(--color-border)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        No active deployment currently assigned. Use Security Operations roster or Transfer action.
                                    </div>
                                )}
                            </div>

                            {deploymentHistory.length > 0 && (
                                <div className="modal-form-card">
                                    <div className="modal-form-card-title">
                                        <i className="bx bx-history"></i> Deployment History
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', background: 'var(--color-surface-secondary)' }}>
                                                <th style={{ padding: '8px 12px' }}>Period</th>
                                                <th style={{ padding: '8px 12px' }}>Site</th>
                                                <th style={{ padding: '8px 12px' }}>Post</th>
                                                <th style={{ padding: '8px 12px' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deploymentHistory.map((d: any) => (
                                                <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '8px 12px' }}>{d.start_date} {d.end_date ? `to ${d.end_date}` : ''}</td>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{d.site_name}</td>
                                                    <td style={{ padding: '8px 12px' }}>{d.post_name || '—'}</td>
                                                    <td style={{ padding: '8px 12px' }}><span className="badge badge-secondary">{d.status}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 9: LIFECYCLE & HISTORY */}
                    {activeModalTab === 'LIFECYCLE' && employee && (
                        <div className="modal-form-card">
                            <EmployeeLifecycleWorkspace
                                employee={employee}
                                designations={designations}
                                departments={departments}
                                isSecurity={isSecurity}
                                onRefresh={() => {
                                    if (employee?.id) fetchChildData(employee.id);
                                    onSave();
                                }}
                            />
                        </div>
                    )}

                    {/* Pinned Modal Form Footer */}
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginTop: '16px', 
                        paddingTop: '16px', 
                        borderTop: '1px solid var(--color-border)' 
                    }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            * Fields marked with red asterisk are required.
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Button type="button" variant="secondary" onClick={onClose}>
                                <i className="bx bx-x"></i> Close
                            </Button>
                            <Button type="submit" variant="primary" loading={loading}>
                                <i className="bx bx-save"></i> {isSecurity ? 'Save Workforce Record' : 'Save Employee Details'}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </Modal>
    );
};
