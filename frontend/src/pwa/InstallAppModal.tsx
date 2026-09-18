import React from 'react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose, isIOS }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 25, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '440px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          color: '#f8fafc',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/app/assets/logo-icon.png"
              alt="Zorvex"
              style={{ width: '36px', height: '36px', borderRadius: '8px' }}
            />
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Install Zorvex App</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Standalone ERP Experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            aria-label="Close"
          >
            <i className="bx bx-x"></i>
          </button>
        </div>

        {/* Content based on platform */}
        {isIOS ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px', lineHeight: 1.5 }}>
            <p style={{ margin: 0, color: '#cbd5e1' }}>
              To install Zorvex on your iPhone or iPad:
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '20px', color: '#38bdf8' }}><i className="bx bx-share"></i></span>
              <div>
                <strong>1. Tap Share</strong>
                <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
                  Tap the Share icon at the bottom of Safari.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '20px', color: '#38bdf8' }}><i className="bx bx-plus-square"></i></span>
              <div>
                <strong>2. Add to Home Screen</strong>
                <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '20px', color: '#22c55e' }}><i className="bx bx-check-circle"></i></span>
              <div>
                <strong>3. Launch from Home Screen</strong>
                <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
                  Tap Add in the top right. Zorvex will run as a native standalone app.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px', lineHeight: 1.5 }}>
            <p style={{ margin: 0, color: '#cbd5e1' }}>
              To install Zorvex on your desktop or browser:
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '20px', color: '#38bdf8' }}><i className="bx bx-laptop"></i></span>
              <div>
                <strong>Address Bar Install Icon</strong>
                <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
                  Click the install computer icon (or app icon) in the right side of the Chrome/Edge address bar.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '20px', color: '#38bdf8' }}><i className="bx bx-dots-vertical-rounded"></i></span>
              <div>
                <strong>Browser Menu</strong>
                <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
                  Open browser settings menu ⋮ → <strong>"Cast, save, and share"</strong> or <strong>"Install Zorvex"</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
