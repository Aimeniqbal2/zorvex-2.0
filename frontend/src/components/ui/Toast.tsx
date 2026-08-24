import React from 'react';
import { useToastStore } from '../../stores/toastStore';
import type { ToastType } from '../../stores/toastStore';

const ICONS: Record<ToastType, string> = {
    success: 'bx-check-circle',
    error: 'bx-error-circle',
    warning: 'bx-error',
    info: 'bx-info-circle'
};

export const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToastStore();

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <div key={toast.id} className={`toast ${toast.type}`}>
                    <i className={`bx ${ICONS[toast.type]} toast-icon`}></i>
                    <span className="toast-message">{toast.message}</span>
                    <button className="toast-close" onClick={() => removeToast(toast.id)}>
                        <i className='bx bx-x'></i>
                    </button>
                </div>
            ))}
        </div>
    );
};
