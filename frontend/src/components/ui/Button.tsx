import React from 'react';
import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning';
    size?: 'small' | 'medium' | 'large' | string;
    icon?: string;
    loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
    children, 
    variant = 'primary', 
    size,
    icon, 
    loading, 
    className = '', 
    disabled,
    ...props 
}) => {
    return (
        <button 
            className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} 
            disabled={disabled || loading}
            {...props}
        >
            {loading ? <i className='bx bx-loader-alt bx-spin'></i> : (icon && <i className={`bx ${icon}`}></i>)}
            {children}
        </button>
    );
};
