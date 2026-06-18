import { db, type Job } from './db';

const JOB_PREFIX = 'J-';
const INVOICE_PREFIX = 'INV-';
const START = 1001;

function parsePrefixedNumber(n: string, prefix: string): number {
  const num = parseInt(n.replace(prefix, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

/* ─── Job numbers ─── */

export function formatJobNumber(num: number): string {
  return `${JOB_PREFIX}${String(num).padStart(4, '0')}`;
}

export async function nextJobNumber(userId: string): Promise<string> {
  const jobsWithNumbers = await db.jobs
    .where('user_id')
    .equals(userId)
    .and((j) => !!j.job_number)
    .toArray();

  const nums = jobsWithNumbers.map((j) => parsePrefixedNumber(j.job_number!, JOB_PREFIX));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  const next = Math.max(max + 1, START);
  return formatJobNumber(next);
}

export async function ensureJobNumber(job: Job, userId: string): Promise<Job> {
  if (job.job_number && job.user_id === userId) return job;

  const jobNumber = await nextJobNumber(userId);
  const n = new Date().toISOString();

  await db.jobs.update(job.id, {
    job_number: jobNumber,
    updated_at: n,
    _sync_status: 'pending',
  });

  await db.sync_queue.add({
    operation: 'update',
    table_name: 'jobs',
    record_id: job.id,
    payload: { job_number: jobNumber, updated_at: n },
    created_at: n,
    retry_count: 0,
  });

  return { ...job, job_number: jobNumber };
}

export async function getJobNumber(jobId: string, userId: string): Promise<string | null> {
  const job = await db.jobs.get(jobId);
  if (!job || job.user_id !== userId) return null;
  if (job.job_number) return job.job_number;
  const updated = await ensureJobNumber(job, userId);
  return updated.job_number ?? null;
}

/* ─── Invoice numbers ─── */

export function formatInvoiceNumber(num: number): string {
  return `${INVOICE_PREFIX}${String(num).padStart(4, '0')}`;
}

export async function nextInvoiceNumber(userId: string): Promise<string> {
  const jobsWithInvoices = await db.jobs
    .where('user_id')
    .equals(userId)
    .and((j) => !!j.invoice_number)
    .toArray();

  const nums = jobsWithInvoices.map((j) => parsePrefixedNumber(j.invoice_number!, INVOICE_PREFIX));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  const next = Math.max(max + 1, START);
  return formatInvoiceNumber(next);
}

export async function ensureInvoiceNumber(job: Job, userId: string): Promise<Job> {
  if (job.invoice_number && job.user_id === userId) return job;

  const invoiceNumber = await nextInvoiceNumber(userId);
  const n = new Date().toISOString();

  await db.jobs.update(job.id, {
    invoice_number: invoiceNumber,
    invoice_sent_at: n,
    updated_at: n,
    _sync_status: 'pending',
  });

  await db.sync_queue.add({
    operation: 'update',
    table_name: 'jobs',
    record_id: job.id,
    payload: { invoice_number: invoiceNumber, invoice_sent_at: n, updated_at: n },
    created_at: n,
    retry_count: 0,
  });

  return { ...job, invoice_number: invoiceNumber, invoice_sent_at: n };
}

export async function getInvoiceNumber(jobId: string, userId: string): Promise<string | null> {
  const job = await db.jobs.get(jobId);
  if (!job || job.user_id !== userId) return null;
  if (job.invoice_number) return job.invoice_number;
  const updated = await ensureInvoiceNumber(job, userId);
  return updated.invoice_number ?? null;
}
