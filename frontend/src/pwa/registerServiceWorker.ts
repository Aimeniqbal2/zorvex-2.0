/**
 * Zorvex ERP 2.0 - Service Worker Registration & Lifecycle
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Register when page loads to avoid blocking initial critical path rendering
  window.addEventListener('load', () => {
    const swUrl = '/app/sw.js';

    navigator.serviceWorker
      .register(swUrl, { scope: '/' })
      .then((registration) => {
        // Check for updates periodically (e.g., every 60 minutes)
        setInterval(() => {
          registration.update().catch(() => {
            // Silently ignore network failures on periodic update check
          });
        }, 60 * 60 * 1000);

        // Detect new waiting worker
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[Zorvex PWA] A new version of Zorvex is available.');
              window.dispatchEvent(new CustomEvent('zorvex:pwa-update-available', {
                detail: { registration }
              }));
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[Zorvex PWA] Service Worker registration failed:', error);
      });

    // Handle controller change (reloads page when new worker takes control)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
