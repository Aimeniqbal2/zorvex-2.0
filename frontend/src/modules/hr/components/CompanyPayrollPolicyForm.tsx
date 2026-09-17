import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';

export const CompanyPayrollPolicyForm: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [standardHours, setStandardHours] = useState('160.00');
    const [multiplier, setMultiplier] = useState('1.50');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchPolicy = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/api/hrm/company-payroll-policy/');
            const data = response.data.results || response.data;
            const activePolicy = Array.isArray(data) ? data.find((p: any) => p.is_active) : data;
            if (activePolicy) {
                setStandardHours(activePolicy.standard_monthly_hours.toString());
                setMultiplier(activePolicy.overtime_multiplier.toString());
            }
        } catch (error) {
            console.error('Failed to fetch policy:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPolicy();
    }, []);

    const handleSave = async () => {
        try {
            setLoading(true);
            setError(null);
            setSuccess(null);
            await apiClient.post('/api/hrm/company-payroll-policy/', {
                standard_monthly_hours: parseFloat(standardHours),
                overtime_multiplier: parseFloat(multiplier),
                is_active: true
            });
            setSuccess('Payroll policy updated successfully.');
            fetchPolicy();
        } catch (error: any) {
            console.error('Failed to save policy:', error);
            const msg = error.response?.data?.standard_monthly_hours?.[0] || 
                        error.response?.data?.overtime_multiplier?.[0] || 
                        error.response?.data?.non_field_errors?.[0] || 
                        'Failed to update payroll policy.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card>
            <div style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '1.25rem', fontWeight: 600 }}>Payroll & Overtime Policy</h3>
                {error && <div style={{ color: 'var(--color-error)', marginBottom: '16px', padding: '12px', background: 'var(--color-error-bg)', borderRadius: '4px' }}>{error}</div>}
                {success && <div style={{ color: 'var(--color-success)', marginBottom: '16px', padding: '12px', background: 'var(--color-success-bg)', borderRadius: '4px' }}>{success}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', fontWeight: 500 }}>Standard Monthly Hours</label>
                        <input
                            type="number"
                            step="0.01"
                            value={standardHours}
                            onChange={(e) => setStandardHours(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                        />
                        <small style={{ color: 'var(--color-text-light)' }}>Used to derive hourly overtime rate from base salary.</small>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', fontWeight: 500 }}>Overtime Multiplier</label>
                        <input
                            type="number"
                            step="0.01"
                            value={multiplier}
                            onChange={(e) => setMultiplier(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                        />
                        <small style={{ color: 'var(--color-text-light)' }}>Multiplier applied to calculated hourly overtime rate.</small>
                    </div>
                    <div style={{ marginTop: '16px' }}>
                        <Button onClick={handleSave} disabled={loading} variant="primary">
                            {loading ? 'Saving...' : 'Save Policy'}
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
};
