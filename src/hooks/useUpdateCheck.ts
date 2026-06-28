import { useEffect, useState, useCallback } from 'react';

/**
 * Polls /version.json to detect when a new build has been deployed.
 * This is the primary update mechanism for iOS PWA users, since iOS Safari
 * does not reliably check for service worker updates when launching from
 * the Home Screen icon.
 *
 * - Checks on mount, every 60 seconds, and on visibilitychange (foreground)
 * - Shows an update banner when the version hash changes
 * - User can dismiss (snooze for current session) or apply (clear SW + reload)
 */
export function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('buildlogg_update_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Skip in dev mode — version.json doesn't exist
    if (import.meta.env.DEV) return;

    let currentHash: string | null = null;
    let interval: ReturnType<typeof setInterval>;

    async function check() {
      try {
        // Cache-bust to bypass both SW cache and browser HTTP cache
        const resp = await fetch(`/version.json?t=${Date.now()}`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (currentHash === null) {
          currentHash = data.hash;
        } else if (data.hash !== currentHash) {
          if (!dismissed) setUpdateAvailable(true);
        }
      } catch {
        // Network error — ignore, will retry
      }
    }

    check();
    interval = setInterval(check, 60000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setUpdateAvailable(false);
    try {
      sessionStorage.setItem('buildlogg_update_dismissed', 'true');
    } catch {}
  }, []);

  const applyUpdate = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch {}
    }
    if ('caches' in window) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      } catch {}
    }
    window.location.reload();
  }, []);

  return { updateAvailable, dismiss, applyUpdate };
}
