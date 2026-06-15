import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { hasPendingSync } from '../../lib/sync';

export default function SyncIndicator() {
  const isOnline = useAppStore((s) => s.isOnline);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const pending = await hasPendingSync();
        if (mounted) setHasPending(pending);
      } catch {
        if (mounted) setHasPending(false);
      }
    }
    check();
    const interval = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [syncStatus]);

  // For mock users, never show sync indicator
  const isMockUser = typeof window !== 'undefined' && !!localStorage.getItem('buildlogg_mock_user');
  if (isMockUser) return null;

  // Trust syncStatus when it says synced — don't show stale indicator
  if (syncStatus === 'synced') return null;

  // No pending sync → hide completely
  if (!hasPending) return null;

  // Offline with pending work
  if (!isOnline) {
    return (
      <span className="text-micro font-medium text-brand-muted">
        Offline
      </span>
    );
  }

  // Sync error
  if (syncStatus === 'error') {
    return (
      <span className="text-micro font-medium text-amber-600">
        Sync error
      </span>
    );
  }

  // Actively syncing
  return (
    <span className="text-micro font-medium text-brand-muted">
      Syncing…
    </span>
  );
}
