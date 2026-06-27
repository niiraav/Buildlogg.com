import { supabase } from './supabase';
import { db } from './db';
import type { Profile, Customer, Job, LineItem, WorkLogEntry, Payment, JobPhoto, BookingRequest, CustomItem, MaterialItem, MessageTemplate, GeneratedDocument, QuoteFollowUp, RecurringJob } from './db';
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
  const [profile, customers, jobs, lineItems, workLog, payments, jobPhotos, bookingRequests, customItems, materialItems, messageTemplates, generatedDocuments, quoteFollowUps, recurringJobs] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('customers').select('*').eq('user_id', userId),
    supabase.from('jobs').select('*').eq('user_id', userId),
    supabase.from('line_items').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('work_log').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('payments').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('job_photos').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('booking_requests').select('*').eq('merchant_id', userId),
    // W3-2: 6 tables that were never pulled — now included
    supabase.from('custom_items').select('*').eq('user_id', userId),
    supabase.from('material_items').select('*').eq('user_id', userId),
    supabase.from('message_templates').select('*').eq('user_id', userId),
    supabase.from('generated_documents').select('*').eq('user_id', userId),
    supabase.from('quote_follow_ups').select('*').eq('user_id', userId),
    supabase.from('recurring_jobs').select('*').eq('user_id', userId),
  ]);

  // Quiet error handling: suppress expected errors (missing tables, invalid UUID in mock mode)
  const quietLog = (label: string, err: unknown) => {
    const msg = (err as { message?: string })?.message || '';
    if (msg.includes('PGRST205') || msg.includes('Could not find the table') || msg.includes('schema cache')) return;
    if (msg.includes('invalid input syntax for type uuid')) return; // mock mode
    console.warn(`[initialSync] ${label}:`, err);
  };
  if (profile.error) quietLog('profiles', profile.error);
  if (customers.error) quietLog('customers', customers.error);
  if (jobs.error) quietLog('jobs', jobs.error);
  if (lineItems.error) quietLog('line_items', lineItems.error);
  if (workLog.error) quietLog('work_log', workLog.error);
  if (payments.error) quietLog('payments', payments.error);
  if (jobPhotos.error) quietLog('job_photos', jobPhotos.error);
  if (bookingRequests.error) quietLog('booking_requests', bookingRequests.error);
  if (customItems.error) quietLog('custom_items', customItems.error);
  if (materialItems.error) quietLog('material_items', materialItems.error);
  if (messageTemplates.error) quietLog('message_templates', messageTemplates.error);
  if (generatedDocuments.error) quietLog('generated_documents', generatedDocuments.error);
  if (quoteFollowUps.error) quietLog('quote_follow_ups', quoteFollowUps.error);
  if (recurringJobs.error) quietLog('recurring_jobs', recurringJobs.error);

  await db.transaction('rw', [
    db.profiles, db.customers, db.jobs, db.line_items, db.work_log,
    db.payments, db.job_photos, db.booking_requests,
    db.custom_items, db.material_items, db.message_templates,
    db.generated_documents, db.quote_follow_ups, db.recurring_jobs,
  ], async () => {
    if (profile.data) {
      const local = await db.profiles.get(profile.data.id);
      if (!local || local._sync_status !== 'pending') {
        await db.profiles.put({ ...(profile.data as Profile), _sync_status: 'synced' });
      }
    }
    if (customers.data) await safeBulkPut(db.customers, customers.data as Customer[]);
    if (jobs.data) await safeBulkPut(db.jobs, jobs.data as Job[]);
    if (lineItems.data) await safeBulkPut(db.line_items, lineItems.data as LineItem[]);
    if (workLog.data) await safeBulkPut(db.work_log, workLog.data as WorkLogEntry[]);
    if (payments.data) await safeBulkPut(db.payments, payments.data as Payment[]);
    if (jobPhotos.data) await safeBulkPut(db.job_photos, jobPhotos.data as JobPhoto[]);
    if (bookingRequests.data) await safeBulkPut(db.booking_requests, bookingRequests.data as BookingRequest[]);
    // W3-2: 6 newly-pulled tables
    if (customItems.data) await safeBulkPut(db.custom_items, customItems.data as CustomItem[]);
    if (materialItems.data) await safeBulkPut(db.material_items, materialItems.data as MaterialItem[]);
    if (messageTemplates.data) await safeBulkPut(db.message_templates, messageTemplates.data as MessageTemplate[]);
    if (generatedDocuments.data) await safeBulkPut(db.generated_documents, generatedDocuments.data as GeneratedDocument[]);
    if (quoteFollowUps.data) await safeBulkPut(db.quote_follow_ups, quoteFollowUps.data as QuoteFollowUp[]);
    if (recurringJobs.data) await safeBulkPut(db.recurring_jobs, recurringJobs.data as RecurringJob[]);
  });
}
