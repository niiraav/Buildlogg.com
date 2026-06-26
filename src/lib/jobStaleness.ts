import { db, type Job, type Customer } from './db';

/* ─── Constants ─── */

const SAME_DAY_STALE_MS = 3 * 60 * 60 * 1000;      // 3 hours
const MULTI_DAY_STALE_MS = 24 * 60 * 60 * 1000;     // 24 hours
const SCHEDULED_END_GRACE_MS = 60 * 60 * 1000;      // 1 hour past scheduled_end
const OVERNIGHT_MIN_ELAPSED_MS = 8 * 60 * 60 * 1000; // 8 hours
const OVERNIGHT_MIN_HOUR = 6;                        // only auto-complete after 6 AM

export {
  SAME_DAY_STALE_MS,
  MULTI_DAY_STALE_MS,
  SCHEDULED_END_GRACE_MS,
  OVERNIGHT_MIN_ELAPSED_MS,
  OVERNIGHT_MIN_HOUR,
};

/* ─── Types ─── */

export type StaleType = 'same_day' | 'crossed_midnight' | 'multi_day';

export interface StaleJob extends Job {
  customer?: Customer;
  staleType: StaleType;
}

/* ─── Helpers ─── */

function isSameCalendarDay(a: string, b: Date): boolean {
  const dA = new Date(a);
  return dA.toDateString() === b.toDateString();
}

/* ─── Core staleness detection ─── */

/**
 * Classifies a job's staleness state.
 * Returns null if the job is not stale.
 */
export function getStaleType(job: Job, now = new Date()): StaleType | null {
  if (job.status !== 'in_progress') return null;
  if (!job.actual_start) return null;

  const elapsed = now.getTime() - new Date(job.actual_start).getTime();
  const sameDay = isSameCalendarDay(job.actual_start, now);

  // Multi-day jobs: only flag after 24h
  if (job.is_multi_day) {
    if (elapsed > MULTI_DAY_STALE_MS) return 'multi_day';
    return null;
  }

  // Crossed midnight but not flagged as multi-day yet
  // Only trigger if at least 3 hours have elapsed — prevents false positive
  // when a job is started near midnight and it's now just past midnight
  if (!sameDay) {
    if (elapsed > SAME_DAY_STALE_MS) return 'crossed_midnight';
    return null;
  }

  // Same day — check 3h fixed threshold
  if (elapsed > SAME_DAY_STALE_MS) return 'same_day';

  // Same day — check scheduled_end trigger
  // BUT only if the job has been running for at least 3h. A job started
  // after its scheduled_end time (e.g., started at 1pm for a 10am-12pm slot)
  // should NOT be flagged stale immediately — it was just started.
  if (job.scheduled_end && elapsed > SAME_DAY_STALE_MS) {
    const scheduledEndPlusGrace = new Date(job.scheduled_end).getTime() + SCHEDULED_END_GRACE_MS;
    if (now.getTime() > scheduledEndPlusGrace) return 'same_day';
  }

  return null;
}

/**
 * Returns all stale in-progress jobs for a user, sorted by actual_start ascending (most stale first).
 */
export async function getStaleInProgressJobs(userId: string): Promise<StaleJob[]> {
  const inProgressJobs = await db.jobs
    .where('status')
    .equals('in_progress')
    .filter((j) => j.user_id === userId && !j.is_sample)
    .toArray();

  const stale: StaleJob[] = [];

  for (const job of inProgressJobs) {
    const staleType = getStaleType(job);
    if (!staleType) continue;

    const customer = await db.customers.get(job.customer_id);
    stale.push({ ...job, customer: customer || undefined, staleType });
  }

  // Sort by actual_start ascending — most stale first
  stale.sort((a, b) => {
    const aStart = a.actual_start ? new Date(a.actual_start).getTime() : 0;
    const bStart = b.actual_start ? new Date(b.actual_start).getTime() : 0;
    return aStart - bStart;
  });

  return stale;
}

/**
 * Marks a job as multi-day. Used when Dave taps "Multi-day job" or "Still working"
 * on a crossed-midnight banner.
 */
export async function markJobAsMultiDay(jobId: string): Promise<void> {
  const n = new Date().toISOString();
  await db.jobs.update(jobId, {
    is_multi_day: true,
    updated_at: n,
    _sync_status: 'pending',
  });
  await db.sync_queue.add({
    operation: 'update',
    table_name: 'jobs',
    record_id: jobId,
    payload: { is_multi_day: true, updated_at: n },
    created_at: n,
    retry_count: 0,
  });
}

/**
 * Returns jobs that are eligible for overnight auto-completion.
 * Only same-day jobs (did NOT cross midnight) with >8h elapsed and current hour >= 6.
 * Multi-day jobs are never included.
 */
export async function getOvernightAutoCompletableJobs(userId: string): Promise<Job[]> {
  const now = new Date();
  if (now.getHours() < OVERNIGHT_MIN_HOUR) return [];

  const inProgressJobs = await db.jobs
    .where('status')
    .equals('in_progress')
    .filter((j) => {
      if (j.user_id !== userId) return false;
      if (j.is_sample) return false;
      if (j.is_multi_day) return false;
      if (!j.actual_start) return false;
      // Must be same calendar day — crossed midnight jobs are excluded
      if (!isSameCalendarDay(j.actual_start, now)) return false;
      const elapsed = now.getTime() - new Date(j.actual_start).getTime();
      return elapsed > OVERNIGHT_MIN_ELAPSED_MS;
    })
    .toArray();

  return inProgressJobs;
}

/**
 * Auto-completes a job by moving it to awaiting_payment.
 * Does NOT create a payment record — Dave hasn't been paid yet.
 */
export async function autoCompleteJob(job: Job): Promise<void> {
  const n = new Date().toISOString();
  await db.jobs.update(job.id, {
    status: 'awaiting_payment',
    actual_end: n,
    invoice_sent_at: n,
    updated_at: n,
    _sync_status: 'pending',
  });
  await db.work_log.add({
    id: crypto.randomUUID(),
    job_id: job.id,
    type: 'status_change',
    description: 'Auto-completed — job was left in progress',
    created_at: n,
    _sync_status: 'pending',
  });
  await db.sync_queue.add({
    operation: 'update',
    table_name: 'jobs',
    record_id: job.id,
    payload: { status: 'awaiting_payment', actual_end: n, invoice_sent_at: n, updated_at: n },
    created_at: n,
    retry_count: 0,
  });
}

/* ─── Time formatting helpers ─── */

export function formatElapsed(startTime: string, now = new Date()): string {
  const elapsed = now.getTime() - new Date(startTime).getTime();
  const hours = Math.floor(elapsed / (1000 * 60 * 60));
  const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function daysBetween(startTime: string, now = new Date()): number {
  const start = new Date(startTime);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
