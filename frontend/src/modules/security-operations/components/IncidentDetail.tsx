import React, { useState, useEffect } from 'react';
import { getIncident, reviewIncident, uploadIncidentAttachment, downloadIncidentAttachment } from '../api';
import type { IncidentReport } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

interface IncidentDetailProps {
    incidentId: string;
    onBack: () => void;
}

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    OPEN: 'danger',
    UNDER_REVIEW: 'primary',
    RESOLVED: 'success',
    CLOSED: 'default',
};

const SEVERITY_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'warning'> = {
    LOW: 'default',
    MEDIUM: 'warning',
    HIGH: 'danger',
    CRITICAL: 'danger',
};

export const IncidentDetail: React.FC<IncidentDetailProps> = ({ incidentId, onBack }) => {
    const [incident, setIncident] = useState<IncidentReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const [reviewStatus, setReviewStatus] = useState('UNDER_REVIEW');
    const [reviewResolution, setReviewResolution] = useState('');
    const [reviewing, setReviewing] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [attachmentDescription, setAttachmentDescription] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const data = await getIncident(incidentId);
            setIncident(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load incident'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [incidentId]);

    const handleReview = async () => {
        if (!incident) return;
        setReviewing(true);
        try {
            await reviewIncident(incident.id, reviewStatus, reviewResolution);
            await fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to submit review");
        } finally {
            setReviewing(false);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile || !incident) return;
        
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('incident', incident.id);
            fd.append('file', selectedFile);
            fd.append('description', attachmentDescription);
            
            await uploadIncidentAttachment(fd);
            
            setSelectedFile(null);
            setAttachmentDescription('');
            await fetchData();
        } catch (err) {
            console.error(err);
            alert("Failed to upload attachment");
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (attachmentId: string, filename: string) => {
        try {
            const blob = await downloadIncidentAttachment(attachmentId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (err) {
            console.error("Download failed", err);
            alert("Failed to download file");
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading incident details...</div>;
    if (error || !incident) return <ErrorState message={error?.message || 'Not found'} onRetry={fetchData} />;

    const canReview = incident.status !== 'CLOSED';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="secondary" onClick={onBack}>&larr; Back to List</Button>
                    <h2 className="text-2xl font-semibold">Incident: {incident.incident_number}</h2>
                </div>
                <div className="flex gap-2">
                    <Badge variant={SEVERITY_VARIANT[incident.severity] || 'default'}>
                        {incident.severity}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[incident.status] || 'default'}>
                        {incident.status.replace('_', ' ')}
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card className="p-6 space-y-4">
                        <h3 className="text-xl font-medium">{incident.title}</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-300">
                            <div><span className="font-semibold">Type:</span> {incident.incident_type.replace('_', ' ')}</div>
                            <div><span className="font-semibold">Site:</span> {incident.site_name}</div>
                            <div><span className="font-semibold">Reported By:</span> {incident.employee_name}</div>
                            <div><span className="font-semibold">Occurred At:</span> {new Date(incident.occurred_at).toLocaleString()}</div>
                            <div><span className="font-semibold">Reported At:</span> {new Date(incident.reported_at).toLocaleString()}</div>
                        </div>

                        <div>
                            <h4 className="font-medium mt-4 mb-2">Description</h4>
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-md whitespace-pre-wrap">
                                {incident.description}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-medium mt-4 mb-2">Action Taken</h4>
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-md whitespace-pre-wrap">
                                {incident.action_taken || 'No action recorded.'}
                            </div>
                        </div>

                        {incident.resolution && (
                            <div>
                                <h4 className="font-medium mt-4 mb-2">Review Resolution</h4>
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-md whitespace-pre-wrap">
                                    {incident.resolution}
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card className="p-6 space-y-4">
                        <h3 className="text-lg font-medium">Attachments</h3>
                        
                        {incident.attachments && incident.attachments.length > 0 ? (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {incident.attachments.map(att => {
                                    const filename = att.file.split('/').pop() || 'file';
                                    return (
                                        <li key={att.id} className="py-3 flex justify-between items-center">
                                            <div>
                                                <p className="font-medium">{att.description || filename}</p>
                                                <p className="text-xs text-gray-500">
                                                    By {att.uploaded_by_name} on {new Date(att.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                            <Button variant="secondary" onClick={() => handleDownload(att.id, filename)}>
                                                Download
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500">No attachments found.</p>
                        )}

                        <form onSubmit={handleUpload} className="mt-4 p-4 border border-dashed rounded-md space-y-3 dark:border-gray-700">
                            <h4 className="font-medium text-sm">Upload New Attachment</h4>
                            <div>
                                <input 
                                    type="file" 
                                    required 
                                    onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                                    className="text-sm w-full"
                                />
                            </div>
                            <div>
                                <Input 
                                    placeholder="Brief description (optional)" 
                                    value={attachmentDescription}
                                    onChange={e => setAttachmentDescription(e.target.value)}
                                />
                            </div>
                            <Button type="submit" disabled={uploading || !selectedFile}>
                                {uploading ? 'Uploading...' : 'Upload'}
                            </Button>
                        </form>
                    </Card>
                </div>

                <div className="space-y-6">
                    {canReview && (
                        <Card className="p-6 space-y-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
                            <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100">Review Actions</h3>
                            <div>
                                <label className="block text-sm font-medium mb-1">Update Status</label>
                                <select
                                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                                    value={reviewStatus}
                                    onChange={(e) => setReviewStatus(e.target.value)}
                                >
                                    <option value="UNDER_REVIEW">Under Review</option>
                                    <option value="RESOLVED">Resolved</option>
                                    <option value="CLOSED">Closed</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Resolution / Notes</label>
                                <textarea
                                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm min-h-[80px]"
                                    value={reviewResolution}
                                    onChange={(e) => setReviewResolution(e.target.value)}
                                    placeholder="Manager notes on how this was handled..."
                                />
                            </div>
                            <Button onClick={handleReview} disabled={reviewing} className="w-full">
                                {reviewing ? 'Submitting...' : 'Submit Review'}
                            </Button>
                        </Card>
                    )}

                    <Card className="p-6 space-y-2">
                        <h3 className="font-medium">Metadata</h3>
                        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                            <p><strong>Created:</strong> {new Date(incident.created_at).toLocaleString()}</p>
                            <p><strong>Updated:</strong> {new Date(incident.updated_at).toLocaleString()}</p>
                            {incident.reviewed_by && (
                                <p><strong>Last Reviewed:</strong> {new Date(incident.reviewed_at!).toLocaleString()}</p>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
