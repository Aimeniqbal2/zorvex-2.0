import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
    isOpen?: boolean;
    onClose: () => void;
    title: string | React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: string;
    width?: string;
    maxHeight?: string;
    closeOnOverlayClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
    isOpen = true, 
    onClose, 
    title, 
    children, 
    footer, 
    size, 
    width,
    maxHeight,
    closeOnOverlayClick = false 
}) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        // Only close when closeOnOverlayClick is explicitly enabled (prevents accidental data loss)
        if (closeOnOverlayClick && e.target === e.currentTarget) {
            onClose();
        }
    };

    const contentStyle: React.CSSProperties = {
        ...(width ? { maxWidth: width, width: '100%' } : {}),
        ...(maxHeight ? { maxHeight } : {})
    };

    return createPortal(
        <div className={`modal-overlay ${size ? `modal-${size}` : ''}`} onClick={handleBackdropClick}>
            <div 
                className="modal-content" 
                ref={modalRef} 
                role="dialog" 
                aria-modal="true" 
                style={Object.keys(contentStyle).length > 0 ? contentStyle : undefined}
            >
                <div className="modal-header">
                    <h2 className="modal-title">{title}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close" title="Close">
                        <i className='bx bx-x'></i>
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
