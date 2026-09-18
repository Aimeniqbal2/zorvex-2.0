import { useState, useEffect, useCallback } from 'react';

// Web API interface for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

// Global cached prompt to survive component unmounts
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: BeforeInstallPromptEvent) => {
    // Prevent default mini-infobar or auto-prompting
    e.preventDefault();
    globalDeferredPrompt = e;
    promptListeners.forEach((listener) => listener(e));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((listener) => listener(null));
  });
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return Boolean(isStandalone || isIOSStandalone);
  });
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);

  // Detect iOS platform
  const isIOS = typeof window !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  useEffect(() => {
    const handlePromptChange = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
    };

    promptListeners.add(handlePromptChange);

    const mql = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    mql.addEventListener('change', handleMediaChange);

    return () => {
      promptListeners.delete(handlePromptChange);
      mql.removeEventListener('change', handleMediaChange);
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (isInstalled) {
      return 'accepted';
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          globalDeferredPrompt = null;
          return 'accepted';
        } else {
          return 'dismissed';
        }
      } catch (err) {
        console.warn('[Zorvex PWA] Prompt failed:', err);
        return 'dismissed';
      }
    }

    // Fallback: If no native prompt is available (e.g. iOS or manual browser instructions), show guide
    setShowGuideModal(true);
    return 'manual';
  }, [deferredPrompt, isInstalled]);

  // Install is available if not installed AND (we have deferred prompt OR device is iOS Safari / supports manual install)
  const canInstall = !isInstalled && (deferredPrompt !== null || isIOS);

  return {
    canInstall,
    isInstalled,
    isIOS,
    showGuideModal,
    setShowGuideModal,
    triggerInstall
  };
}
