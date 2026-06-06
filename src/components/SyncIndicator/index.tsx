import { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { syncWorker } from '../../lib/sync';

export default function SyncIndicator() {
  const isOnline = useAppStore((s) => s.isOnline);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const [hasPending, setHasPending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const prevStatusRef = useRef(syncStatus);

  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      if (!mounted) return;

      // Check for pending records
      const tables = [db.jobs, db.customers, db.line_items, db.work_log, db.payments, db.profiles];
      let pendingFound = false;
      let errorFound = false;
      for (const table of tables) {
        const pendingCount = await table.where('_sync_status').equals('pending').count();
        if (pendingCount > 0) pendingFound = true;
        const errorCount = await table.where('_sync_status').equals('error').count();
        if (errorCount > 0) errorFound = true;
      }
      setHasPending(pendingFound);
      setHasError(errorFound);
    }

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Track when sync started so we can detect stuck syncs
  useEffect(() => {
    if (syncStatus === 'syncing' && prevStatusRef.current !== 'syncing') {
      setSyncStartedAt(Date.now());
    }
    if (syncStatus !== 'syncing') {
      setSyncStartedAt(null);
    }
    prevStatusRef.current = syncStatus;
  }, [syncStatus]);

  const isStuck = syncStatus === 'syncing' && syncStartedAt !== null && (Date.now() - syncStartedAt > 15000);

  // Offline with pending changes
  if (!isOnline && hasPending) {
    return (
      <span className="text-[10px] font-medium text-[#9CA3AF]">
        Offline
      </span>
    );
  }

  // Stuck sync — show as error with retry
  if (isStuck) {
    return (
      <button
        onClick={() => syncWorker()}
        className="text-[10px] font-medium text-[#D97706]"
      >
        Sync stuck · Tap to retry
      </button>
    );
  }

  // Actively syncing
  if (syncStatus === 'syncing') {
    return (
      <span className="text-[10px] font-medium text-[#9CA3AF]">
        Syncing…
      </span>
    );
  }

  // Sync error (failed after retries) — allow retry
  if (syncStatus === 'error' && hasError) {
    return (
      <button
        onClick={() => syncWorker()}
        className="text-[10px] font-medium text-[#D97706]"
      >
        Sync error · Tap to retry
      </button>
    );
  }

  // Pending records but sync idle (will run on next interval)
  if (hasPending) {
    return (
      <span className="text-[10px] font-medium text-[#9CA3AF]">
        Will sync
      </span>
    );
  }

  return null;
}
