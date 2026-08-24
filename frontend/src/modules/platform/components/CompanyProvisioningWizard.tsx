import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

import { getIndustryTemplate, provisionCompany } from '../api';
import type { IndustryTemplate, ProvisioningPayload } from '../types';
import { MODULE_REGISTRY } from '../../../config/modules';

export const CompanyProvisioningWizard: React.FC = () => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    
    const [payload, setPayload] = useState<ProvisioningPayload>({
        name: '',
        business_type: 'security',
        admin_username: '',
        admin_email: '',
        admin_password: '',
        selected_modules: []
    });

    const [template, setTemplate] = useState<IndustryTemplate | null>(null);

    useEffect(() => {
        if (step === 3 && !template) {
            fetchTemplate(payload.business_type);
        }
    }, [step, payload.business_type]);

    const fetchTemplate = async (businessType: string) => {
        setLoading(true);
        try {
            const data = await getIndustryTemplate(businessType);
            setTemplate(data);
            
            // Auto-select required and recommended
            const toSelect = new Set<string>();
            data.required_modules.forEach(m => toSelect.add(m));
            data.recommended_modules.forEach(m => toSelect.add(m));
            
            setPayload(prev => ({
                ...prev,
                selected_modules: Array.from(toSelect)
            }));
        } catch (e: any) {
            setError('Failed to fetch industry template');
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);

    const toggleModule = (modCode: string, isRequired: boolean) => {
        if (isRequired) return; // Cannot toggle required modules
        setPayload(prev => {
            const current = new Set(prev.selected_modules);
            if (current.has(modCode)) {
                current.delete(modCode);
            } else {
                current.add(modCode);
            }
            return { ...prev, selected_modules: Array.from(current) };
        });
    };

    const submitProvisioning = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await provisionCompany(payload);
            setSuccessMessage(`Tenant successfully provisioned! Company ID: ${res.company_id}`);
            setStep(6);
        } catch (e: any) {
            setError(e.response?.data?.error || 'Failed to provision company.');
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch(step) {
            case 1:
                return (
                    <div>
                        <h3>Company Information</h3>
                        <p style={{ color: 'var(--color-text-muted)' }}>Enter the basic details for the new tenant.</p>
                        <Input label="Company Name" value={payload.name} onChange={e => setPayload({...payload, name: e.target.value})} required />
                        <Input label="Domain (Optional)" value={payload.domain || ''} onChange={e => setPayload({...payload, domain: e.target.value})} />
                        <Input label="Phone" value={payload.phone || ''} onChange={e => setPayload({...payload, phone: e.target.value})} />
                        <Input label="Address" value={payload.address || ''} onChange={e => setPayload({...payload, address: e.target.value})} />
                    </div>
                );
            case 2:
                return (
                    <div>
                        <h3>Business Type</h3>
                        <p style={{ color: 'var(--color-text-muted)' }}>Select the primary industry to apply recommended settings.</p>
                        <select 
                            className="input-field" 
                            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                            value={payload.business_type} 
                            onChange={e => {
                                setPayload({...payload, business_type: e.target.value});
                                setTemplate(null);
                            }}
                        >
                            <option value="security">Security Services</option>
                            <option value="general">General</option>
                            <option value="retail">Retail</option>
                        </select>
                    </div>
                );
            case 3:
                return (
                    <div>
                        <h3>Module Selection</h3>
                        <p style={{ color: 'var(--color-text-muted)' }}>These modules are recommended based on the business type.</p>
                        {loading && <p>Loading template...</p>}
                        {!loading && template && (
                            <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                                {MODULE_REGISTRY.map(mod => {
                                    const isRequired = template.required_modules.includes(mod.code);
                                    const isRecommended = template.recommended_modules.includes(mod.code) && !isRequired;
                                    const isSelected = payload.selected_modules.includes(mod.code);
                                    
                                    if (!isRequired && !isRecommended && !template.optional_modules.includes(mod.code)) {
                                        return null;
                                    }

                                    return (
                                        <div 
                                            key={mod.code} 
                                            onClick={() => toggleModule(mod.code, isRequired)}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                padding: '16px', 
                                                border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                borderRadius: '8px',
                                                cursor: isRequired ? 'not-allowed' : 'pointer',
                                                background: isSelected ? 'rgba(var(--color-primary-rgb), 0.05)' : 'transparent'
                                            }}
                                        >
                                            <i className={`bx ${mod.icon}`} style={{ fontSize: '24px', marginRight: '16px', color: 'var(--color-primary)' }}></i>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600 }}>{mod.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                    {isRequired && <span style={{ color: 'var(--color-danger)' }}>[Required] </span>}
                                                    {isRecommended && <span style={{ color: 'var(--color-success)' }}>[Recommended] </span>}
                                                </div>
                                            </div>
                                            <div style={{ width: '20px', height: '20px', border: '2px solid var(--color-primary)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {isSelected && <div style={{ width: '12px', height: '12px', background: 'var(--color-primary)', borderRadius: '2px' }}></div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            case 4:
                return (
                    <div>
                        <h3>Initial Administrator</h3>
                        <p style={{ color: 'var(--color-text-muted)' }}>Setup the first super user for this tenant.</p>
                        <Input label="Username" value={payload.admin_username} onChange={e => setPayload({...payload, admin_username: e.target.value})} required />
                        <Input label="Email" type="email" value={payload.admin_email} onChange={e => setPayload({...payload, admin_email: e.target.value})} required />
                        <Input label="Temporary Password" type="password" value={payload.admin_password} onChange={e => setPayload({...payload, admin_password: e.target.value})} required />
                    </div>
                );
            case 5:
                return (
                    <div>
                        <h3>Review & Provision</h3>
                        <div style={{ padding: '16px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                            <p><strong>Company Name:</strong> {payload.name}</p>
                            <p><strong>Business Type:</strong> {payload.business_type}</p>
                            <p><strong>Modules:</strong> {payload.selected_modules.join(', ')}</p>
                            <p><strong>Admin Username:</strong> {payload.admin_username}</p>
                        </div>
                    </div>
                );
            case 6:
                return (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <i className="bx bxs-check-circle" style={{ fontSize: '64px', color: 'var(--color-success)', marginBottom: '16px' }}></i>
                        <h3>Provisioning Complete</h3>
                        <p>{successMessage}</p>
                        <Button variant="primary" style={{ marginTop: '24px' }} onClick={() => window.location.reload()}>Finish</Button>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <Card title={`Company Provisioning Wizard - Step ${Math.min(step, 5)}/5`}>
            {error && <div style={{ padding: '12px', background: 'var(--color-danger)', color: 'white', marginBottom: '16px', borderRadius: '4px' }}>{error}</div>}
            <div style={{ minHeight: '400px', marginBottom: '24px' }}>
                {renderStep()}
            </div>
            
            {step < 6 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                    <Button variant="secondary" onClick={handleBack} disabled={step === 1 || loading}>Back</Button>
                    {step < 5 ? (
                        <Button variant="primary" onClick={handleNext} disabled={loading || (step === 1 && !payload.name) || (step === 4 && (!payload.admin_username || !payload.admin_password))}>Next</Button>
                    ) : (
                        <Button variant="primary" onClick={submitProvisioning} disabled={loading}>
                            {loading ? 'Provisioning...' : 'Provision Company'}
                        </Button>
                    )}
                </div>
            )}
        </Card>
    );
};
