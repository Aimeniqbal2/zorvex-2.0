import React, { useState, useEffect } from 'react';
import { getSecurityAttendance } from '../api';
import type { SecurityAttendance } from '../types';

export const AttendanceView: React.FC = () => {
    const [attendances, setAttendances] = useState<SecurityAttendance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [dateFilter, setDateFilter] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });

    const fetchAttendance = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getSecurityAttendance({ date: dateFilter });
            setAttendances(data.results || []);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch attendance');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAttendance();
    }, [dateFilter]);

    return (
        <div className="security-sites-view">
            <div className="view-header">
                <h2>Operational Attendance</h2>
                <div className="header-actions">
                    <input 
                        type="date" 
                        value={dateFilter} 
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="zorvex-input"
                    />
                    <button className="zorvex-btn" onClick={fetchAttendance}>
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {error && <div className="zorvex-error-state">{error}</div>}

            <div className="zorvex-table-container">
                {loading ? (
                    <div className="zorvex-loading-state">Loading attendance...</div>
                ) : attendances.length === 0 ? (
                    <div className="zorvex-empty-state">No attendance records found for this date.</div>
                ) : (
                    <table className="zorvex-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Site (Derived)</th>
                                <th>Date</th>
                                <th>Check In</th>
                                <th>Check Out</th>
                                <th>Status</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendances.map((att) => (
                                <tr key={att.id}>
                                    <td>{att.employee_name}</td>
                                    <td>{att.site_name}</td>
                                    <td>{att.date}</td>
                                    <td>
                                        {att.check_in ? new Date(att.check_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                                    </td>
                                    <td>
                                        {att.check_out ? new Date(att.check_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                                    </td>
                                    <td>
                                        <span className={`status-badge status-${att.status.toLowerCase()}`}>
                                            {att.status}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="source-badge">
                                            {att.source === 'DUTY_ASSIGNMENT' ? 'Synced Duty' : att.source}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
