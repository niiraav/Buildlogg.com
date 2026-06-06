import { supabase } from './supabase';
import { db } from './db';
import type { SyncQueueItem } from './db';

const MAX_RETRIES = 5;

export async function syncWorker() {
  if (!navigator.onLine) return;

  const pending = await db.sync_queue.orderBy('created_at').toArray();

  for (const item of pending) {
    // Skip items that have been retried too many times
    if (item.retry_count >= MAX_RETRIES) {
      await updateSyncStatus(item.table_name, item.record_id, 'error');
      continue;
    }

    try {
      await pushToSupabase(item);
      await db.sync_queue.delete(item.id as number);
      await updateSyncStatus(item.table_name, item.record_id, 'synced');
    } catch (err) {
      // Mark error status and increment retry
      await updateSyncStatus(item.table_name, item.record_id, 'error');
      await db.sync_queue.update(item.id as number, {
        retry_count: item.retry_count + 1,
      });
    }
  }
}

async function pushToSupabase(item: SyncQueueItem) {
  const { operation, table_name, payload } = item;

  // Clean payload: remove internal fields and ensure id is present for updates
  const cleanPayload = { ...payload };
  delete cleanPayload._sync_status;

  const table = supabase.from(table_name);

  if (operation === 'insert') {
    await table.insert(cleanPayload);
  } else if (operation === 'update') {
    await table.update(cleanPayload).eq('id', item.record_id);
  } else if (operation === 'delete') {
    await table.delete().eq('id', item.record_id);
  }
}

async function updateSyncStatus(
  tableName: string,
  recordId: string,
  status: 'synced' | 'pending' | 'error'
) {
  switch (tableName) {
    case 'profiles':
      await db.profiles.update(recordId, { _sync_status: status });
      break;
    case 'customers':
      await db.customers.update(recordId, { _sync_status: status });
      break;
    case 'jobs':
      await db.jobs.update(recordId, { _sync_status: status });
      break;
    case 'line_items':
      await db.line_items.update(recordId, { _sync_status: status });
      break;
    case 'work_log':
      await db.work_log.update(recordId, { _sync_status: status });
      break;
    case 'payments':
      await db.payments.update(recordId, { _sync_status: status });
      break;
  }
}

// Check if any records have pending or error sync status
export async function hasPendingSync(): Promise<boolean> {
  const pendingQueue = await db.sync_queue.count();
  if (pendingQueue > 0) return true;

  // Also check Dexie records with error status (failed items that are no longer in queue)
  const tables = [db.jobs, db.customers, db.line_items, db.work_log, db.payments, db.profiles];
  for (const table of tables) {
    const count = await table.where('_sync_status').equals('pending').count();
    if (count > 0) return true;
  }
  return false;
}

// Check if any records have error status
export async function hasSyncError(): Promise<boolean> {
  const tables = [db.jobs, db.customers, db.line_items, db.work_log, db.payments, db.profiles];
  for (const table of tables) {
    const count = await table.where('_sync_status').equals('error').count();
    if (count > 0) return true;
  }
  return false;
}
