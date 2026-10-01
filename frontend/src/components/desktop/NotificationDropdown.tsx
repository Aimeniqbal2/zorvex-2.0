import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../api/client';

export interface NotificationItem {
    id: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onUnreadCountChange?: (count: number) => void;
}

export const NotificationDropdown: React.FC<Props> = ({ isOpen, onClose, onUnreadCountChange }) => {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/notifications/notifications/');
            const items: NotificationItem[] = Array.isArray(res.data) 
                ? res.data 
                : (res.data?.results || []);
            setNotifications(items);
            const unread = items.filter(n => !n.is_read).length;
            if (onUnreadCountChange) {
                onUnreadCountChange(unread);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await apiClient.post(`/api/notifications/notifications/${id}/mark-read/`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            const newUnread = notifications.filter(n => n.id !== id && !n.is_read).length;
            if (onUnreadCountChange) onUnreadCountChange(newUnread);
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await apiClient.post('/api/notifications/notifications/mark-all-read/');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            if (onUnreadCountChange) onUnreadCountChange(0);
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    if (!isOpen) return null;

    const unreadCount = notifications.filter(n => !n.is_read).length;
    const filteredNotifications = filter === 'unread' 
        ? notifications.filter(n => !n.is_read)
        : notifications;

    const formatTime = (isoString: string) => {
        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMin = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMin / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMin < 2) return 'Just now';
            if (diffMin < 60) return `${diffMin}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays === 1) return 'Yesterday';
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    };

    return (
        <div 
            ref={dropdownRef}
            style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: '-10px',
                width: '380px',
                maxWidth: '92vw',
                maxHeight: '520px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '16px',
                boxShadow: '0 16px 40px -8px rgba(0, 0, 0, 0.22)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                zIndex: 300,
                animation: 'dropdownFadeIn 0.15s ease-out'
            }}
        >
            {/* Header */}
            <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--color-surface)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>
                        Notifications
                    </span>
                    {unreadCount > 0 && (
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: 'var(--color-primary)'
                        }}>
                            {unreadCount} new
                        </span>
                    )}
                </div>

                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllRead}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 6px',
                            borderRadius: '6px'
                        }}
                        title="Mark all as read"
                    >
                        <i className='bx bx-check-double' style={{ fontSize: '15px' }}></i> Mark all read
                    </button>
                )}
            </div>

            {/* Filter Tabs */}
            <div style={{
                display: 'flex',
                padding: '8px 14px',
                gap: '8px',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface-secondary)'
            }}>
                <button
                    onClick={() => setFilter('all')}
                    style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: filter === 'all' ? 'var(--color-surface)' : 'transparent',
                        color: filter === 'all' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        boxShadow: filter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    All ({notifications.length})
                </button>
                <button
                    onClick={() => setFilter('unread')}
                    style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: filter === 'unread' ? 'var(--color-surface)' : 'transparent',
                        color: filter === 'unread' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        boxShadow: filter === 'unread' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    Unread ({unreadCount})
                </button>
            </div>

            {/* Notification List */}
            <div style={{
                overflowY: 'auto',
                flex: 1,
                maxHeight: '360px',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {loading ? (
                    <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '24px', marginBottom: '8px', display: 'block', color: 'var(--color-primary)' }}></i>
                        Loading updates...
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            color: 'var(--color-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px',
                            marginBottom: '10px'
                        }}>
                            <i className='bx bx-bell-off'></i>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)', marginBottom: '4px' }}>
                            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', maxWidth: '240px', marginLeft: 'auto', marginRight: 'auto' }}>
                            {filter === 'unread' ? 'You have read all your notifications.' : "You're all caught up! Operational alerts will appear here."}
                        </p>
                    </div>
                ) : (
                    filteredNotifications.map(item => (
                        <div
                            key={item.id}
                            onClick={(e) => !item.is_read && handleMarkAsRead(item.id, e)}
                            style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--color-border)',
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'flex-start',
                                cursor: 'pointer',
                                background: item.is_read ? 'transparent' : 'rgba(59, 130, 246, 0.04)',
                                transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--color-surface-secondary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = item.is_read ? 'transparent' : 'rgba(59, 130, 246, 0.04)';
                            }}
                        >
                            {/* Icon */}
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: item.is_read ? 'var(--color-surface-secondary)' : 'rgba(59, 130, 246, 0.12)',
                                color: item.is_read ? 'var(--color-text-muted)' : 'var(--color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                                flexShrink: 0,
                                marginTop: '2px'
                            }}>
                                <i className={`bx ${item.title.toLowerCase().includes('costing') || item.title.toLowerCase().includes('proposal') ? 'bx-file' : item.title.toLowerCase().includes('roster') || item.title.toLowerCase().includes('guard') ? 'bx-shield' : 'bx-bell'}`}></i>
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                                    <span style={{
                                        fontSize: '13px',
                                        fontWeight: item.is_read ? 600 : 700,
                                        color: 'var(--color-text)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {item.title}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                                        {formatTime(item.created_at)}
                                    </span>
                                </div>
                                <p style={{
                                    margin: 0,
                                    fontSize: '12px',
                                    color: 'var(--color-text-muted)',
                                    lineHeight: 1.4,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {item.message}
                                </p>
                            </div>

                            {/* Unread indicator */}
                            {!item.is_read && (
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: 'var(--color-primary)',
                                    marginTop: '6px',
                                    flexShrink: 0
                                }} />
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: '10px 16px',
                background: 'var(--color-surface-secondary)',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--color-text-muted)'
            }}>
                <span><i className='bx bx-check-shield' style={{ color: 'var(--color-primary)' }}></i> Zorvex Live Notifications</span>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: '4px'
                    }}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
};
