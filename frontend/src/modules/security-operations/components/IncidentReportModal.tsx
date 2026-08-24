import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { createIncident, getOperationalSites, apiClient } from '../api';
import type { IncidentReport, OperationalSite } from '../types';

interface IncidentReportModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const INCIDENT_TYPES = [
    { value: 'SECURITY_BREACH', label: 'Security Breach' },
    { value: 'THEFT', label: 'Theft' },
    { value: 'TRESPASS', label: 'Trespass' },
    { value: 'FIRE', label: 'Fire' },
    { value: 'MEDICAL', label: 'Medical Emergency' },
    { value: 'PROPERTY_DAMAGE', label: 'Property Damage' },
    { value: 'VIOLENCE', label: 'Violence' },
    { value: 'SUSPICIOUS_ACTIVITY', label: 'Suspicious Activity' },
    { value: 'SAFETY', label: 'Safety Hazard' },
    { value: 'OTHER', label: 'Other' },
];

const SEVERITY_LEVELS = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' },
];

export const IncidentReportModal: React.FC<IncidentReportModalProps> = ({ onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    
    const [formData, setFormData] = useState<Partial<IncidentReport>>({
        site: '',
        reported_by: '',
        incident_type: 'SECURITY_BREACH',
        severity: 'MEDIUM',
        occurred_at: new Date().toISOString().slice(0, 16),
        title: '',
        description: '',
        action_taken: '',
    });

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [sitesRes, empRes] = await Promise.all([
                    getOperationalSites({}), // fetch all sites
                    apiClient.get('/api/hrm/employees/')
                ]);
                setSites(sitesRes.results || []);
                setEmployees(empRes.data?.results || []);
                
                // For simplicity, just use the first available employee if none assigned
                if (empRes.data?.results?.length > 0) {
                    setFormData(prev => ({ ...prev, reported_by: empRes.data.results[0].id }));
                }
            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };
        fetchInitialData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createIncident(formData);
            onSuccess();
        } catch (err) {
            console.error(err);
            alert("Failed to report incident. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Report Security Incident" isOpen={true} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Site</label>
                        <select
                            required
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.site}
                            onChange={(e) => setFormData({ ...formData, site: e.target.value })}
                        >
                            <option value="">Select a Site...</option>
                            {sites.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Reported By</label>
                        <select
                            required
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.reported_by}
                            onChange={(e) => setFormData({ ...formData, reported_by: e.target.value })}
                        >
                            <option value="">Select Reporter...</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Incident Type</label>
                        <select
                            required
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.incident_type}
                            onChange={(e) => setFormData({ ...formData, incident_type: e.target.value as any })}
                        >
                            {INCIDENT_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Severity</label>
                        <select
                            required
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.severity}
                            onChange={(e) => setFormData({ ...formData, severity: e.target.value as any })}
                        >
                            {SEVERITY_LEVELS.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Date & Time Occurred</label>
                        <Input
                            type="datetime-local"
                            required
                            value={formData.occurred_at}
                            onChange={(e) => setFormData({ ...formData, occurred_at: e.target.value })}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <Input
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Brief title of the incident"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                        required
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Detailed description of what happened..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Action Taken</label>
                    <textarea
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                        value={formData.action_taken}
                        onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })}
                        placeholder="What actions were taken immediately? (e.g. Police called, first aid administered)"
                    />
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-gray-700">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Submitting...' : 'Report Incident'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
