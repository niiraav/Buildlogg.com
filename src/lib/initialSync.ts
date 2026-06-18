import { supabase } from './supabase';
import { db } from './db';
import type { Profile, Customer, Job, LineItem, WorkLogEntry, Payment } from './db';
import type { Table } from 'dexie';

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

export async function initialSync(userId: string) {
  const [profile, customers, jobs, lineItems, workLog, payments] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('customers').select('*').eq('user_id', userId),
    supabase.from('jobs').select('*').eq('user_id', userId),
    supabase.from('line_items').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('work_log').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('payments').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
  ]);

  if (profile.error) console.error('[initialSync] profiles fetch failed:', profile.error);
  if (customers.error) console.error('[initialSync] customers fetch failed:', customers.error);
  if (jobs.error) console.error('[initialSync] jobs fetch failed:', jobs.error);
  if (lineItems.error) console.error('[initialSync] line_items fetch failed:', lineItems.error);
  if (workLog.error) console.error('[initialSync] work_log fetch failed:', workLog.error);
  if (payments.error) console.error('[initialSync] payments fetch failed:', payments.error);

  await db.transaction('rw', [db.profiles, db.customers, db.jobs, db.line_items, db.work_log, db.payments], async () => {
    if (profile.data) {
      const local = await db.profiles.get(profile.data.id);
      if (!local || local._sync_status !== 'pending') {
        await db.profiles.put({ ...(profile.data as Profile), _sync_status: 'synced' });
      }
    }
    if (customers.data) {
      await safeBulkPut(db.customers, customers.data as Customer[]);
    }
    if (jobs.data) {
      await safeBulkPut(db.jobs, jobs.data as Job[]);
    }
    if (lineItems.data) {
      await safeBulkPut(db.line_items, lineItems.data as LineItem[]);
    }
    if (workLog.data) {
      await safeBulkPut(db.work_log, workLog.data as WorkLogEntry[]);
    }
    if (payments.data) {
      await safeBulkPut(db.payments, payments.data as Payment[]);
    }
  });
}
