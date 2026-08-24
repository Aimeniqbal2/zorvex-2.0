import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
}

export interface ToastState {
    toasts: ToastMessage[];
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
    
    // Convenience methods
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    addToast: (type, message) => {
        const id = Math.random().toString(36).substring(2, 9);
        set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
        }, 3000);
    },
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
    
    success: (message) => set((state) => { state.addToast('success', message); return {}; }),
    error: (message) => set((state) => { state.addToast('error', message); return {}; }),
    warning: (message) => set((state) => { state.addToast('warning', message); return {}; }),
    info: (message) => set((state) => { state.addToast('info', message); return {}; }),
}));
