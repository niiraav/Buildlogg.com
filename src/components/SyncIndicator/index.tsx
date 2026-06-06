import { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { syncWorker } from '../../lib/sync';

export default function SyncIndicator() {
  const isOnline = useAppStore((s) => s.isOnline);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkPending() {
      if (!mounted) return;
      const tables = [db.jobs, db.customers, db.line_items, db.work_log, db.payments, db.profiles];
      let pendingFound = false;
      for (const table of tables) {
        const count = await table.where('_sync_status').equals('pending').count();
        if (count > 0) {
          pendingFound = true;
          break;
        }
      }
      setHasPending(pendingFound);
    }

    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!isOnline && hasPending) {
    return (
      <span className="text-[10px] font-medium text-[#9CA3AF]">
        Offline
      </span>
    );
  }

  if (syncStatus === 'error') {
    return (
      <button
        onClick={() => syncWorker()}
        className="text-[10px] font-medium text-[#D97706]"
      >
        Sync error · Tap to retry
      </button>
    );
  }

  if (hasPending) {
    return (
      <span className="text-[10px] font-medium text-[#9CA3AF]">
        Syncing…
      </span>
    );
  }

  return null;
}
