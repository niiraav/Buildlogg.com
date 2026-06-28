/**
 * Realtime subscription manager for multi-device cloud sync.
 *
 * Subscribes to Supabase Postgres Changes for key tables. When a change
 * arrives (from another device, the booking Function, or the Stripe webhook),
 * fetches the full row and writes it to Dexie with table-specific conflict
 * resolution (last-write-wins for tables with updated_at, always-accept for
 * immutable tables and booking_requests).
 *
 * Tables are grouped by their realtime filter strategy:
 * - Group 1: user_id + updated_at (jobs, customers, custom_items, message_templates)
 * - Group 2: job-based RLS, no user_id column (line_items, work_log, payments)
 * - Group 3: merchant_id, no updated_at (booking_requests)
 * - Group 4: user_id, INSERT/DELETE only (job_photos — avoids base64 in realtime)
 */

import { supabase } from './supabase';
import { db } from './db';
import type { Table } from 'dexie';

type RealtimeCallback = () => void;

/** Fetch a single row by id from Supabase (full row, not just changed columns). */
async function fetchRow(tableName: string, id: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
    if (error || !data) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Check if a local record is pending (unsynced local change — don't overwrite). */
async function isLocalPending(table: Table<{ id: string; _sync_status: string }>, id: string): Promise<boolean> {
  const local = await table.get(id);
  return !!local && local._sync_status === 'pending';
}

/** Compare updated_at timestamps for last-write-wins. */
function isRemoteNewer(remoteUpdated: string | undefined, localUpdated: string | undefined): boolean {
  if (!remoteUpdated) return false;
  if (!localUpdated) return true;
  return new Date(remoteUpdated).getTime() > new Date(localUpdated).getTime();
}

/**
 * Handle an incoming realtime event with conflict resolution.
 * Generic handler that works for any Dexie table with { id, _sync_status }.
 */
async function handleEvent(
  tableName: string,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow: { id: string } | null,
  oldRow: { id: string } | null,
  onUpdate: RealtimeCallback,
) {
  const id = (newRow?.id || oldRow?.id) as string;
  if (!id) return;

  // Map table name to Dexie table
  const tableMap: Record<string, Table<{ id: string; _sync_status: string; updated_at?: string }>> = {
    jobs: db.jobs as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    customers: db.customers as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    custom_items: db.custom_items as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    message_templates: db.message_templates as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    line_items: db.line_items as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    work_log: db.work_log as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    payments: db.payments as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    booking_requests: db.booking_requests as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    job_photos: db.job_photos as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
    reminder_log: db.reminder_log as unknown as Table<{ id: string; _sync_status: string; updated_at?: string }>,
  };
  const dexieTable = tableMap[tableName];
  if (!dexieTable) return;

  if (eventType === 'DELETE') {
    // Don't delete if there's a pending local change
    if (await isLocalPending(dexieTable as Table<{ id: string; _sync_status: string }>, id)) return;
    try { await dexieTable.delete(id); } catch { /* already deleted */ }
    onUpdate();
    return;
  }

  // INSERT or UPDATE: fetch the full row (realtime payload may be partial)
  const fullRow = await fetchRow(tableName, id);
  if (!fullRow) return;

  // Conflict resolution: don't overwrite pending local changes
  if (await isLocalPending(dexieTable as Table<{ id: string; _sync_status: string }>, id)) {
    // For UPDATE: check if remote is newer before overwriting a pending record
    if (eventType === 'UPDATE') {
      const local = await dexieTable.get(id);
      const remoteUpdated = fullRow.updated_at as string | undefined;
      if (local && isRemoteNewer(remoteUpdated, (local as Record<string, unknown>).updated_at as string | undefined)) {
        // Remote is newer — overwrite even the pending local change
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (dexieTable as any).put({ ...fullRow, _sync_status: 'synced' });
        onUpdate();
      }
    }
    return;
  }

  // No pending local change — accept the remote row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (dexieTable as any).put({ ...fullRow, _sync_status: 'synced' });
  onUpdate();
}

/**
 * Subscribe to realtime changes for the authenticated user.
 * Returns a cleanup function that unsubscribes all channels.
 */
export function subscribeRealtime(userId: string, onUpdate: RealtimeCallback): () => void {
  const channels: ReturnType<typeof supabase.channel>[] = [];

  // Group 1: user_id + updated_at tables
  const group1Tables = ['jobs', 'customers', 'custom_items', 'message_templates'];
  for (const table of group1Tables) {
    const channel = supabase
      .channel(`realtime:${table}:${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        (payload) => {
          handleEvent(table, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            payload.new as { id: string } | null,
            payload.old as { id: string } | null,
            onUpdate);
        }
      )
      .subscribe();
    channels.push(channel);
  }

  // Group 2: job-based tables (no user_id column — RLS handles filtering)
  const group2Tables = ['line_items', 'work_log', 'payments'];
  for (const table of group2Tables) {
    const channel = supabase
      .channel(`realtime:${table}:${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          handleEvent(table, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            payload.new as { id: string } | null,
            payload.old as { id: string } | null,
            onUpdate);
        }
      )
      .subscribe();
    channels.push(channel);
  }

  // Group 3: booking_requests (merchant_id filter)
  const bookingChannel = supabase
    .channel(`realtime:booking_requests:${userId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'booking_requests', filter: `merchant_id=eq.${userId}` },
      (payload) => {
        handleEvent('booking_requests', payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          payload.new as { id: string } | null,
          payload.old as { id: string } | null,
          onUpdate);
      }
    )
    .subscribe();
  channels.push(bookingChannel);

  // Group 4: job_photos (INSERT + DELETE only — avoid base64 in UPDATE events)
  const photoChannel = supabase
    .channel(`realtime:job_photos:${userId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'job_photos', filter: `user_id=eq.${userId}` },
      (payload) => {
        handleEvent('job_photos', 'INSERT', payload.new as { id: string } | null, null, onUpdate);
      }
    )
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'job_photos', filter: `user_id=eq.${userId}` },
      (payload) => {
        handleEvent('job_photos', 'DELETE', null, payload.old as { id: string } | null, onUpdate);
      }
    )
    .subscribe();
  channels.push(photoChannel);

  // Group 5: reminder_log (INSERT only — immutable log entries)
  const reminderChannel = supabase
    .channel(`realtime:reminder_log:${userId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'reminder_log', filter: `user_id=eq.${userId}` },
      (payload) => {
        handleEvent('reminder_log', 'INSERT', payload.new as { id: string } | null, null, onUpdate);
      }
    )
    .subscribe();
  channels.push(reminderChannel);

  // Return cleanup function
  return () => {
    for (const channel of channels) {
      try { supabase.removeChannel(channel); } catch { /* already removed */ }
    }
  };
}
