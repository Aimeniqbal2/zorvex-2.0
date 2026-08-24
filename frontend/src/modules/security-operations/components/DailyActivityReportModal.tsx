import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { createDailyActivityReport, getOperationalSites, apiClient } from '../api';
import type { DailyActivityReport, OperationalSite } from '../types';

interface DailyActivityReportModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const DailyActivityReportModal: React.FC<DailyActivityReportModalProps> = ({ onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    
    const [formData, setFormData] = useState<Partial<DailyActivityReport>>({
        site: '',
        prepared_by: '',
        report_date: new Date().toISOString().slice(0, 10),
        shift_start: new Date(new Date().setHours(9, 0, 0, 0)).toISOString().slice(0, 16),
        shift_end: new Date(new Date().setHours(17, 0, 0, 0)).toISOString().slice(0, 16),
        summary: '',
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
                
                if (empRes.data?.results?.length > 0) {
                    setFormData(prev => ({ ...prev, prepared_by: empRes.data.results[0].id }));
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
            await createDailyActivityReport(formData);
            onSuccess();
        } catch (err) {
            console.error(err);
            alert("Failed to create DAR. Note that a DAR for the same site and date might already exist.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Create Daily Activity Report" isOpen={true} onClose={onClose}>
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
                        <label className="block text-sm font-medium mb-1">Prepared By</label>
                        <select
                            required
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.prepared_by}
                            onChange={(e) => setFormData({ ...formData, prepared_by: e.target.value })}
                        >
                            <option value="">Select Preparer...</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Report Date</label>
                        <Input
                            type="date"
                            required
                            value={formData.report_date}
                            onChange={(e) => setFormData({ ...formData, report_date: e.target.value })}
                        />
                    </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Shift Start</label>
                        <Input
                            type="datetime-local"
                            required
                            value={formData.shift_start}
                            onChange={(e) => setFormData({ ...formData, shift_start: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Shift End</label>
                        <Input
                            type="datetime-local"
                            required
                            value={formData.shift_end}
                            onChange={(e) => setFormData({ ...formData, shift_end: e.target.value })}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Summary (Optional)</label>
                    <textarea
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                        value={formData.summary}
                        onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                        placeholder="General summary of the shift..."
                    />
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-gray-700">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Submitting...' : 'Create DAR'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
