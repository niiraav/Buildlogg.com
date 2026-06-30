import { supabase } from './supabase';
import { db } from './db';
import type { Table } from 'dexie';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function safeBulkPut<T extends { id: string; _sync_status: string }>(
  table: Table<T>,
  remoteRows: T[]
) {
  if (!remoteRows.length) return;
  const pendingIds = new Set<string>(
    await table.where('_sync_status').equals('pending').primaryKeys() as string[]
  );
  const toPut = remoteRows
    .filter((r) => !pendingIds.has(r.id))
    .map((r) => ({ ...r, _sync_status: 'synced' as const }));
  if (toPut.length) await table.bulkPut(toPut);
}

/**
 * Fetch a Supabase table and write results to Dexie, individually.
 * Each table is fetched and written in its own try/catch so that a
 * failure on one table (missing table, schema error, etc.) does NOT
 * prevent other tables from syncing.
 */
async function syncTable<T extends { id: string; _sync_status: string }>(
  query: any,
  table: Table<T>,
): Promise<void> {
  try {
    const result = await query as { data: any; error: any };
    const { data, error } = result;
    if (error) {
      const msg = (error as { message?: string })?.message || '';
      // Suppress expected errors (missing tables, mock mode)
      if (msg.includes('PGRST205') || msg.includes('Could not find the table') || msg.includes('schema cache') || msg.includes('404') || msg.includes('Not Found')) return;
      if (msg.includes('invalid input syntax for type uuid')) return;
      // Silently skip tables not yet in Supabase or mock-mode UUID errors
      return;
    }
    if (data && Array.isArray(data) && data.length > 0) {
      await safeBulkPut(table, data as T[]);

    } else if (data && !Array.isArray(data)) {
      // .single() result — handle profile
      const row = data as T;
      const local = await table.get(row.id);
      if (!local) {
        // No local record — accept remote
        await table.put({ ...row, _sync_status: 'synced' as const });
      } else if (local._sync_status === 'pending') {
        // Local has unsynced changes — don't overwrite with remote
        // (the sync worker will push local changes to Supabase shortly)
        // Skip this row entirely
      } else {
        // Local is synced — accept remote update (last-write-wins)
        await table.put({ ...row, _sync_status: 'synced' as const });
      }
    }
  } catch (err) {

  }
}

export async function initialSync(userId: string) {


  // Sync each table individually — no Promise.all/allSettled.
  // This ensures one failed table doesn't block others.

  // Profile (uses .single())
  await syncTable(
    supabase.from('profiles').select('*').eq('id', userId).single(),
    db.profiles);

  // Core tables with user_id
  await syncTable(
    supabase.from('customers').select('*').eq('user_id', userId),
    db.customers);

  await syncTable(
    supabase.from('jobs').select('*').eq('user_id', userId),
    db.jobs);

  // Child tables — use simple select('*') and rely on RLS for filtering.
  // The previous join syntax (select('*, jobs!inner(user_id)')) was causing
  // silent failures. RLS policies on these tables already filter by user_id
  // via auth.uid(), so no join is needed.
  await syncTable(
    supabase.from('line_items').select('*'),
    db.line_items);

  await syncTable(
    supabase.from('work_log').select('*'),
    db.work_log);

  await syncTable(
    supabase.from('payments').select('*'),
    db.payments);

  await syncTable(
    supabase.from('job_photos').select('*'),
    db.job_photos);

  // Booking requests
  await syncTable(
    supabase.from('booking_requests').select('*').eq('merchant_id', userId),
    db.booking_requests);

  // W3-2 tables
  await syncTable(
    supabase.from('custom_items').select('*').eq('user_id', userId),
    db.custom_items);

  await syncTable(
    supabase.from('material_items').select('*').eq('user_id', userId),
    db.material_items);

  await syncTable(
    supabase.from('message_templates').select('*').eq('user_id', userId),
    db.message_templates);

  await syncTable(
    supabase.from('generated_documents').select('*').eq('user_id', userId),
    db.generated_documents);

  // These tables may not exist in Supabase yet — syncTable will suppress the error
  await syncTable(
    supabase.from('quote_follow_ups').select('*').eq('user_id', userId),
    db.quote_follow_ups);

  await syncTable(
    supabase.from('recurring_jobs').select('*').eq('user_id', userId),
    db.recurring_jobs);

  // payment_chases — pre-existing omission fix
  await syncTable(
    supabase.from('payment_chases').select('*').eq('user_id', userId),
    db.payment_chases);

  // W3-1: reminder_log
  await syncTable(
    supabase.from('reminder_log').select('*').eq('user_id', userId),
    db.reminder_log);

}
