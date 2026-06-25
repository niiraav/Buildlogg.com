/**
 * Customer helpers — search, stats, merge, archive, deduplication.
 * Pure logic over existing Dexie data.
 */
import { db, type Customer, type Job, type Payment } from './db';
import { addToSyncQueue } from './syncQueue';

/**
 * Normalize a UK phone number to +44XXXXXXXXXX format.
 * Handles: 07..., 0..., +44..., 447..., spaces, dashes.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s-]/g, '').replace(/^\+/, '');
  if (/^0?7\d{9}$/.test(cleaned)) {
    return '+44' + cleaned.replace(/^0/, '');
  }
  if (/^447\d{9}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  if (/^0\d{10}$/.test(cleaned)) {
    return '+44' + cleaned.slice(1);
  }
  return phone.trim();
}

export async function searchCustomers(userId: string, query: string): Promise<Customer[]> {
  if (!query.trim()) return [];
  const all = await db.customers.where('user_id').equals(userId).toArray();
  const q = query.toLowerCase().trim();
  return all
    .filter((c) => {
      if (c.is_archived) return false;
      if (c.merged_into) return false;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.business_name || '').toLowerCase().includes(q)
      );
    })
    .slice(0, 10);
}

/**
 * Find a duplicate customer by phone number.
 * Excludes archived and merged customers.
 * Returns the first match or null.
 */
export async function findDuplicateByPhone(userId: string, phone: string): Promise<Customer | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const all = await db.customers.where('user_id').equals(userId).toArray();
  return all.find((c) => {
    if (c.is_archived) return false;
    if (c.merged_into) return false;
    return normalizePhone(c.phone) === normalized;
  }) || null;
}

export interface CustomerStats {
  totalSpent: number;
  outstandingBalance: number;
  jobCount: number;
  lastJobDate?: string;
}

export async function getCustomerStats(customerId: string): Promise<CustomerStats> {
  const jobs = await db.jobs.where('customer_id').equals(customerId).toArray();
  const jobIds = jobs.map((j) => j.id);

  const payments = jobIds.length > 0
    ? await db.payments.where('job_id').anyOf(jobIds).toArray()
    : [];

  const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);

  const outstandingJobs = jobs.filter((j) => j.status === 'awaiting_payment');
  const outstandingJobIds = outstandingJobs.map((j) => j.id);
  const allItems = outstandingJobIds.length > 0
    ? await db.line_items.where('job_id').anyOf(outstandingJobIds).toArray()
    : [];
  const outstandingBalance = outstandingJobs.reduce((sum, j) => {
    const jobItems = allItems.filter((i) => i.job_id === j.id);
    const jobTotal = jobItems.reduce((s, i) => s + i.amount, 0);
    const jobPaid = payments.filter((p) => p.job_id === j.id).reduce((s, p) => s + p.amount, 0);
    return sum + Math.max(0, jobTotal - jobPaid);
  }, 0);

  const sortedJobs = jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    totalSpent,
    outstandingBalance,
    jobCount: jobs.length,
    lastJobDate: sortedJobs[0]?.created_at,
  };
}

export async function getCustomerJobs(customerId: string): Promise<Job[]> {
  const jobs = await db.jobs.where('customer_id').equals(customerId).toArray();
  return jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getCustomerPayments(customerId: string): Promise<Payment[]> {
  const jobs = await db.jobs.where('customer_id').equals(customerId).toArray();
  const jobIds = jobs.map((j) => j.id);
  if (jobIds.length === 0) return [];
  const payments = await db.payments.where('job_id').anyOf(jobIds).toArray();
  return payments.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
}

export async function mergeCustomers(sourceId: string, targetId: string): Promise<void> {
  const jobs = await db.jobs.where('customer_id').equals(sourceId).toArray();
  const now = new Date().toISOString();
  for (const job of jobs) {
    await db.jobs.update(job.id, { customer_id: targetId, updated_at: now, _sync_status: 'pending' });
    await addToSyncQueue('jobs', job.id, { customer_id: targetId, updated_at: now }, 'update');
  }
  await db.customers.update(sourceId, { is_archived: true, merged_into: targetId, updated_at: now, _sync_status: 'pending' });
  await addToSyncQueue('customers', sourceId, { is_archived: true, merged_into: targetId, updated_at: now }, 'update');
}

export async function archiveCustomer(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.customers.update(id, { is_archived: true, updated_at: now, _sync_status: 'pending' });
  await addToSyncQueue('customers', id, { is_archived: true, updated_at: now }, 'update');
}

export async function unarchiveCustomer(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.customers.update(id, { is_archived: false, updated_at: now, _sync_status: 'pending' });
  await addToSyncQueue('customers', id, { is_archived: false, updated_at: now }, 'update');
}
