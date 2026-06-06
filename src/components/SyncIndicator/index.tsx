import { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { syncWorker } from '../../lib/sync';

export default function SyncIndicator() {
  const isOnline = useAppStore((s) => s.isOnline);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const [hasPending, setHasPending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isMockUser, setIsMockUser] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      if (!mounted) return;

      // Synchronous mock check first for immediate hide
      const mockUser = !!localStorage.getItem('tradepad_mock_user');
      setIsMockUser(mockUser);
      if (mockUser) {
        setHasSession(false);
        setHasPending(false);
        setHasError(false);
        setChecked(true);
        return;
      }

      // Check Supabase session
      try {
        const { supabase } = await import('../../lib/supabase');
        const { data } = await supabase.auth.getSession();
        setHasSession(!!data?.session);
      } catch {
        setHasSession(false);
      }

      // Check for pending operations
      const pendingQueueCount = await db.sync_queue
        .where('retry_count')
        .below(5)
        .count();

      // Check for error status on tables
      const tables = [db.jobs, db.customers, db.line_items, db.work_log, db.payments, db.profiles];
      let errorFound = false;
      for (const table of tables) {
        const errorCount = await table.where('_sync_status').equals('error').count();
        if (errorCount > 0) { errorFound = true; break; }
      }

      setHasPending(pendingQueueCount > 0);
      setHasError(errorFound);
      setChecked(true);
    }

    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Only show "Syncing…" after 3s to avoid flickering for quick syncs
  useEffect(() => {
    if (syncStatus === 'syncing' && hasPending) {
      const timer = setTimeout(() => setVisible(true), 3000);
      const safety = setTimeout(() => setVisible(false), 15000);
      return () => {
        clearTimeout(timer);
        clearTimeout(safety);
      };
    } else {
      setVisible(false);
    }
  }, [syncStatus, hasPending]);

  // Don't show anything until we've checked
  if (!checked) return null;

  // Don't show anything for mock users or users without a session
  if (isMockUser || !hasSession) return null;

  // Offline with pending sync_queue items
  if (!isOnline && hasPending) {
    return (
      <span className="text-micro font-medium text-brand-muted">
        Offline
      </span>
    );
  }

  // Sync error (failed after retries)
  if ((syncStatus === 'error' || (syncStatus === 'syncing' && visible)) && hasError) {
    return (
      <button
        onClick={() => syncWorker()}
        className="text-micro font-medium text-amber-600"
      >
        Sync error · Tap to retry
      </button>
    );
  }

  // Actively syncing (visible only after 3s delay and with pending items)
  if (syncStatus === 'syncing' && visible && hasPending) {
    return (
      <span className="text-micro font-medium text-brand-muted">
        Syncing…
      </span>
    );
  }

  return null;
}
