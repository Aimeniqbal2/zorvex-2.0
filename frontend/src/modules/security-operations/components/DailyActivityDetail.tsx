import React, { useState, useEffect } from 'react';
import { getDailyActivityReport, submitDailyActivityReport, reviewDailyActivityReport, createDailyActivityEntry, apiClient } from '../api';
import type { DailyActivityReport, DailyActivityEntry, ActivityType } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

interface DailyActivityDetailProps {
    reportId: string;
    onBack: () => void;
}

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary' | 'warning'> = {
    DRAFT: 'default',
    SUBMITTED: 'warning',
    REVIEWED: 'success',
};

const ENTRY_TYPES = [
    { value: 'PATROL', label: 'Patrol' },
    { value: 'HANDOVER', label: 'Shift Handover' },
    { value: 'ACCESS', label: 'Access Control' },
    { value: 'INCIDENT', label: 'Incident' },
    { value: 'GENERAL', label: 'General Log' },
];

export const DailyActivityDetail: React.FC<DailyActivityDetailProps> = ({ reportId, onBack }) => {
    const [report, setReport] = useState<DailyActivityReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [addingEntry, setAddingEntry] = useState(false);

    const [newEntry, setNewEntry] = useState<Partial<DailyActivityEntry>>({
        timestamp: new Date().toISOString().slice(0, 16),
        activity_type: 'GENERAL',
        description: ''
    });
    const [employees, setEmployees] = useState<any[]>([]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const data = await getDailyActivityReport(reportId);
            setReport(data);
            
            const empRes = await apiClient.get('/api/hrm/employees/');
            setEmployees(empRes.data?.results || []);
            
            if (empRes.data?.results?.length > 0) {
                setNewEntry(prev => ({ ...prev, recorded_by: empRes.data.results[0].id }));
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load DAR'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [reportId]);

    const handleSubmitReport = async () => {
        if (!report) return;
        setSubmitting(true);
        try {
            await submitDailyActivityReport(report.id);
            await fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to submit DAR");
        } finally {
            setSubmitting(false);
        }
    };

    const handleReviewReport = async () => {
        if (!report) return;
        setReviewing(true);
        try {
            await reviewDailyActivityReport(report.id);
            await fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to review DAR");
        } finally {
            setReviewing(false);
        }
    };

    const handleAddEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!report) return;
        setAddingEntry(true);
        try {
            await createDailyActivityEntry({
                ...newEntry,
                report: report.id
            });
            setNewEntry(prev => ({
                ...prev,
                timestamp: new Date().toISOString().slice(0, 16),
                description: '',
                activity_type: 'GENERAL'
            }));
            await fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to add entry");
        } finally {
            setAddingEntry(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading DAR details...</div>;
    if (error || !report) return <ErrorState message={error?.message || 'Not found'} onRetry={fetchData} />;

    const canSubmit = report.status === 'DRAFT';
    const canReview = report.status === 'SUBMITTED';
    const canAddEntry = report.status === 'DRAFT';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="secondary" onClick={onBack}>&larr; Back to List</Button>
                    <h2 className="text-2xl font-semibold">DAR: {report.site_name} - {report.report_date}</h2>
                </div>
                <div className="flex gap-2 items-center">
                    <Badge variant={STATUS_VARIANT[report.status] || 'default'}>
                        {report.status}
                    </Badge>
                    {canSubmit && (
                        <Button onClick={handleSubmitReport} disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Submit Report'}
                        </Button>
                    )}
                    {canReview && (
                        <Button onClick={handleReviewReport} disabled={reviewing} variant="secondary">
                            {reviewing ? 'Reviewing...' : 'Mark Reviewed'}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                    <Card className="p-6 space-y-4">
                        <h3 className="font-medium text-lg">Report Details</h3>
                        <div className="text-sm space-y-2">
                            <p><span className="font-semibold text-gray-600 dark:text-gray-400">Date:</span> {report.report_date}</p>
                            <p><span className="font-semibold text-gray-600 dark:text-gray-400">Site:</span> {report.site_name}</p>
                            <p><span className="font-semibold text-gray-600 dark:text-gray-400">Prepared By:</span> {report.prepared_by_name}</p>
                            <p><span className="font-semibold text-gray-600 dark:text-gray-400">Shift Start:</span> {new Date(report.shift_start).toLocaleString()}</p>
                            <p><span className="font-semibold text-gray-600 dark:text-gray-400">Shift End:</span> {new Date(report.shift_end).toLocaleString()}</p>
                            {report.reviewed_by && (
                                <p><span className="font-semibold text-gray-600 dark:text-gray-400">Reviewed At:</span> {new Date(report.reviewed_at!).toLocaleString()}</p>
                            )}
                        </div>
                    </Card>

                    {report.summary && (
                        <Card className="p-6 space-y-2">
                            <h3 className="font-medium">Shift Summary</h3>
                            <p className="text-sm whitespace-pre-wrap">{report.summary}</p>
                        </Card>
                    )}

                    {canAddEntry && (
                        <Card className="p-6 space-y-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
                            <h3 className="font-medium text-blue-900 dark:text-blue-100">Add Activity Entry</h3>
                            <form onSubmit={handleAddEntry} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium mb-1">Time</label>
                                    <Input
                                        type="datetime-local"
                                        required
                                        value={newEntry.timestamp}
                                        onChange={(e) => setNewEntry({ ...newEntry, timestamp: e.target.value })}
                                        className="text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Type</label>
                                    <select
                                        required
                                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                                        value={newEntry.activity_type}
                                        onChange={(e) => setNewEntry({ ...newEntry, activity_type: e.target.value as ActivityType })}
                                    >
                                        {ENTRY_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Description</label>
                                    <textarea
                                        required
                                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm min-h-[60px]"
                                        value={newEntry.description}
                                        onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                                        placeholder="What happened..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Recorded By</label>
                                    <select
                                        required
                                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                                        value={newEntry.recorded_by || ''}
                                        onChange={(e) => setNewEntry({ ...newEntry, recorded_by: e.target.value })}
                                    >
                                        <option value="">Select Employee...</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <Button type="submit" disabled={addingEntry} className="w-full">
                                    {addingEntry ? 'Adding...' : 'Add Entry'}
                                </Button>
                            </form>
                        </Card>
                    )}
                </div>

                <div className="md:col-span-2 space-y-6">
                    <Card className="p-6">
                        <h3 className="text-xl font-medium mb-6">Activity Timeline</h3>
                        
                        {report.entries && report.entries.length > 0 ? (
                            <div className="relative border-l border-gray-200 dark:border-gray-700 ml-3 space-y-8">
                                {report.entries.map((entry) => (
                                    <div key={entry.id} className="relative pl-6">
                                        <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white dark:ring-gray-900" />
                                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between mb-1">
                                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                <Badge variant="default">{entry.activity_type}</Badge>
                                            </h4>
                                            <span className="text-xs text-gray-500">
                                                by {entry.recorded_by_name}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                            {entry.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No activity entries recorded for this shift yet.</p>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};
