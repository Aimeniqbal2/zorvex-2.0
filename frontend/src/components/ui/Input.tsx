import React from 'react';
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    required?: boolean;
    helpText?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, required, helpText, className = '', ...props }) => {
    return (
        <div className="form-field">
            {label && (
                <label className="form-label">
                    {label}
                    {required && <span className="required">*</span>}
                </label>
            )}
            <input 
                className={`input-base ${error ? 'input-error' : ''} ${className}`} 
                {...props} 
            />
            {helpText && <span className="help-text" style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>{helpText}</span>}
            {error && <span className="input-error-text">{error}</span>}
        </div>
    );
};
