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

  if (profile.error) console.error('[initialSync] profiles fetch failed:', profile.error);
  if (customers.error) console.error('[initialSync] customers fetch failed:', customers.error);
  if (jobs.error) console.error('[initialSync] jobs fetch failed:', jobs.error);
  if (lineItems.error) console.error('[initialSync] line_items fetch failed:', lineItems.error);
  if (workLog.error) console.error('[initialSync] work_log fetch failed:', workLog.error);
  if (payments.error) console.error('[initialSync] payments fetch failed:', payments.error);
  if (jobPhotos.error) console.error('[initialSync] job_photos fetch failed:', jobPhotos.error);
  if (bookingRequests.error) console.error('[initialSync] booking_requests fetch failed:', bookingRequests.error);
  if (customItems.error) console.error('[initialSync] custom_items fetch failed:', customItems.error);
  if (materialItems.error) console.error('[initialSync] material_items fetch failed:', materialItems.error);
  if (messageTemplates.error) console.error('[initialSync] message_templates fetch failed:', messageTemplates.error);
  if (generatedDocuments.error) console.error('[initialSync] generated_documents fetch failed:', generatedDocuments.error);
  if (quoteFollowUps.error) console.error('[initialSync] quote_follow_ups fetch failed:', quoteFollowUps.error);
  if (recurringJobs.error) console.error('[initialSync] recurring_jobs fetch failed:', recurringJobs.error);

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
