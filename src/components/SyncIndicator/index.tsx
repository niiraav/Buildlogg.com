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
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      if (!mounted) return;

      // Check if there's a Supabase session (don't show for mock users)
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data?.session);

      // Only check sync_queue for pending operations (not table _sync_status)
      const pendingQueueCount = await db.sync_queue
        .where('retry_count')
        .below(5)
        .count();

      // Also check if any table records have error status
      const tables = [db.jobs, db.customers, db.line_items, db.work_log, db.payments, db.profiles];
      let errorFound = false;
      for (const table of tables) {
        const errorCount = await table.where('_sync_status').equals('error').count();
        if (errorCount > 0) errorFound = true;
      }

      setHasPending(pendingQueueCount > 0);
      setHasError(errorFound);
    }

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Only show "Syncing…" after 2s to avoid flickering for quick syncs
  useEffect(() => {
    if (syncStatus === 'syncing') {
      const timer = setTimeout(() => setVisible(true), 2000);
      // Safety cap: never show "Syncing…" for more than 10s even if syncStatus is stuck
      const safety = setTimeout(() => setVisible(false), 10000);
      return () => {
        clearTimeout(timer);
        clearTimeout(safety);
      };
    } else {
      setVisible(false);
    }
  }, [syncStatus]);

  // Don't show anything for mock users (no Supabase session)
  if (!hasSession) return null;

  // Offline with pending sync_queue items
  if (!isOnline && hasPending) {
    return (
      <span className="text-micro font-medium text-brand-muted">
        Offline
      </span>
    );
  }

  // Sync error (failed after retries) — allow retry
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

  // Actively syncing (visible only after 2s delay)
  if (syncStatus === 'syncing' && visible && hasPending) {
    return (
      <span className="text-micro font-medium text-brand-muted">
        Syncing…
      </span>
    );
  }

  // Default: nothing — pending records are normal offline-first behavior
  return null;
}
