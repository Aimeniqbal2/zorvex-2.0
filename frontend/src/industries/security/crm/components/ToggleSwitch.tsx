import React from 'react';

interface ToggleSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    size?: 'sm' | 'md';
    title?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
    checked,
    onChange,
    disabled = false,
    size = 'sm',
    title
}) => {
    const isSm = size === 'sm';
    const width = isSm ? 32 : 40;
    const height = isSm ? 18 : 22;
    const knobSize = isSm ? 14 : 18;
    const translateOn = isSm ? 15 : 19;
    const translateOff = 2;

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            title={title}
            onClick={(e) => {
                e.stopPropagation();
                if (!disabled) onChange(!checked);
            }}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                borderRadius: `${height}px`,
                backgroundColor: checked ? '#10b981' : 'var(--color-border, #cbd5e1)',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                padding: 0,
                outline: 'none',
                transition: 'background-color 0.2s ease',
                opacity: disabled ? 0.6 : 1,
                flexShrink: 0
            }}
        >
            <span
                style={{
                    display: 'block',
                    width: `${knobSize}px`,
                    height: `${knobSize}px`,
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    transform: `translateX(${checked ? translateOn : translateOff}px)`,
                    transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            />
        </button>
    );
};

