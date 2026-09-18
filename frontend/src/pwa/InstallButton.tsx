import React from 'react';
import { usePwaInstall } from './usePwaInstall';
import { InstallAppModal } from './InstallAppModal';

interface InstallButtonProps {
  variant?: 'header' | 'button' | 'dropdown-item' | 'icon-only';
  className?: string;
  style?: React.CSSProperties;
  onInstalled?: () => void;
}

export const InstallButton: React.FC<InstallButtonProps> = ({
  variant = 'header',
  className = '',
  style = {},
  onInstalled
}) => {
  const { canInstall, isInstalled, isIOS, showGuideModal, setShowGuideModal, triggerInstall } = usePwaInstall();

  // If already installed, hide the install button completely
  if (isInstalled) {
    return null;
  }

  // If cannot install and not iOS, hide the button (keeps UI clean and unobtrusive)
  if (!canInstall && !isIOS) {
    return null;
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await triggerInstall();
    if (result === 'accepted' && onInstalled) {
      onInstalled();
    }
  };

  return (
    <>
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleClick}
          title="Install Zorvex App"
          aria-label="Install Zorvex App"
          className={className}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 500,
            color: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            ...style
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.18)';
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.25)';
          }}
        >
          <i className="bx bx-download" style={{ fontSize: '16px' }}></i>
          <span>Install App</span>
        </button>
      )}

      {variant === 'button' && (
        <button
          type="button"
          onClick={handleClick}
          className={className}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#ffffff',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
            ...style
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          <i className="bx bx-download" style={{ fontSize: '18px' }}></i>
          <span>Install Zorvex</span>
        </button>
      )}

      {variant === 'dropdown-item' && (
        <button
          type="button"
          onClick={handleClick}
          className={className}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px 12px',
            fontSize: '13px',
            color: '#e2e8f0',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            textAlign: 'left',
            ...style
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <i className="bx bx-download" style={{ fontSize: '16px', color: '#38bdf8' }}></i>
          <span>Install Zorvex App</span>
        </button>
      )}

      {variant === 'icon-only' && (
        <button
          type="button"
          onClick={handleClick}
          title="Install Zorvex App"
          aria-label="Install Zorvex App"
          className={className}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            color: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            ...style
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.18)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)')}
        >
          <i className="bx bx-download" style={{ fontSize: '18px' }}></i>
        </button>
      )}

      {/* Manual installation modal */}
      <InstallAppModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        isIOS={isIOS}
      />
    </>
  );
};
