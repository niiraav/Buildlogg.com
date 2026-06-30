import { supabase } from './supabase';
import { db } from './db';
import type { SyncQueueItem } from './db';
import { useAppStore } from '../store/useAppStore';

const MAX_RETRIES = 5;
const SYNC_TIMEOUT_MS = 8000;
const OVERALL_SYNC_TIMEOUT_MS = 20000;
let syncRunning = false;

function setSyncStatus(status: 'syncing' | 'synced' | 'error') {
  try {
    useAppStore.getState().setSyncStatus(status);
  } catch {
    // Store may not be initialized in some contexts
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Sync timeout')), ms)
    ),
  ]);
}

export async function syncWorker() {
  if (syncRunning) return;
  syncRunning = true;

  // Set a hard ceiling so we never hang forever
  const overallTimeout = setTimeout(() => {
    syncRunning = false;
    setSyncStatus('synced'); // don't leave UI stuck on 'error' — will retry on next cycle
  }, OVERALL_SYNC_TIMEOUT_MS);

  // Reset any stale 'syncing' state from a previous crashed run
  const currentStatus = useAppStore.getState().syncStatus;
  if (currentStatus === 'syncing') {
    setSyncStatus('synced');
  }

  try {
    await _syncWorkerCore();
  } catch {
    setSyncStatus('error');
  } finally {
    clearTimeout(overallTimeout);
    syncRunning = false;
  }
}

async function _syncWorkerCore() {
  if (!navigator.onLine) {
    setSyncStatus('synced');
    return;
  }

  // Check for a valid Supabase session before trying to push.
  // If there's no session (mock user / not signed in), skip sync cleanly.
  let session = null;
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 5000);
    session = data?.session ?? null;
  } catch {
    session = null;
  }
  if (!session) {
    setSyncStatus('synced');
    return;
  }

  setSyncStatus('syncing');

  try {
    const pending = await db.sync_queue.orderBy('created_at').toArray();
    if (pending.length === 0) {
      setSyncStatus('synced');
      return;
    }

    let anyError = false;

    for (const item of pending) {
      // Delete exhausted entries — they already have _sync_status: 'error' on the record
      if (item.retry_count >= MAX_RETRIES) {
        await db.sync_queue.delete(item.id as number);
        continue;
      }

      try {
        await withTimeout(pushToSupabase(item), SYNC_TIMEOUT_MS);
        await db.sync_queue.delete(item.id as number);
        await updateSyncStatus(item.table_name, item.record_id, 'synced');
      } catch (err) {
        anyError = true;
        await updateSyncStatus(item.table_name, item.record_id, 'error');
        await db.sync_queue.update(item.id as number, {
          retry_count: item.retry_count + 1,
        });
      }
    }

    setSyncStatus(anyError ? 'error' : 'synced');
  } catch (err) {
    setSyncStatus('error');
  }
}

async function pushToSupabase(item: SyncQueueItem) {
  const { operation, table_name, payload } = item;

  // Clean payload: remove internal fields and ensure id is present for updates
  const cleanPayload = { ...payload };
  delete cleanPayload._sync_status;

  const table = supabase.from(table_name);

  let result: { error: unknown } | null = null;
  if (operation === 'insert') {
    result = await table.insert(cleanPayload);
  } else if (operation === 'update') {
    result = await table.update(cleanPayload).eq('id', item.record_id);
  } else if (operation === 'delete') {
    result = await table.delete().eq('id', item.record_id);
  }

  if (result?.error) {
    const errMsg = (result.error as any)?.message || '';
    // Table doesn't exist in Supabase yet — skip silently, mark as synced locally
    if (errMsg.includes('Could not find the table') || errMsg.includes('schema cache') || errMsg.includes('404')) {
      console.warn(`[sync] Table '${table_name}' not found in Supabase — skipping (local-only). Run SQL migration to create it.`);
      return; // Don't throw — treat as success so the queue item is removed
    }
    // Column doesn't exist — skip silently (migration not yet run)
    if (errMsg.includes('column') && errMsg.includes('does not exist')) {
      console.warn(`[sync] Column missing in '${table_name}' — skipping. Run SQL migration: ${errMsg}`);
      return;
    }
    console.error(`[sync] ${operation} on ${table_name} failed:`, result.error);
    throw result.error;
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
    case 'job_photos':
      await db.job_photos.update(recordId, { _sync_status: status });
      break;
    case 'generated_documents':
      await db.generated_documents.update(recordId, { _sync_status: status });
      break;
    case 'message_templates':
      await db.message_templates.update(recordId, { _sync_status: status });
      break;
    case 'custom_items':
      await db.custom_items.update(recordId, { _sync_status: status });
      break;
    case 'material_items':
      await db.material_items.update(recordId, { _sync_status: status });
      break;
    case 'booking_requests':
      await db.booking_requests.update(recordId, { _sync_status: status });
      break;
    case 'quote_follow_ups':
      await db.quote_follow_ups.update(recordId, { _sync_status: status });
      break;
    case 'recurring_jobs':
      await db.recurring_jobs.update(recordId, { _sync_status: status });
      break;
    case 'payment_chases':
      await db.payment_chases.update(recordId, { _sync_status: status });
      break;
    case 'reminder_log':
      await db.reminder_log.update(recordId, { _sync_status: status });
      break;
  }
}

// Check if any records have pending sync status
export async function hasPendingSync(): Promise<boolean> {
  return (await db.sync_queue.count()) > 0;
}

// Check if any records have error status
export async function hasSyncError(): Promise<boolean> {
  const tables = [db.jobs, db.customers, db.line_items, db.work_log, db.payments, db.profiles, db.job_photos, db.custom_items, db.material_items, db.booking_requests, db.generated_documents, db.message_templates, db.quote_follow_ups, db.recurring_jobs, db.payment_chases, db.reminder_log];
  for (const table of tables) {
    const count = await table.where('_sync_status').equals('error').count();
    if (count > 0) return true;
  }
  return false;
}
