/**
 * P2-02: Recurring Job Reminders engine.
 * Creates repeat job reminders after a job is marked as paid.
 * Pure logic over Dexie — no UI.
 */
import { db, type Job, type RecurringJob, type RecurrenceInterval } from './db';
import { addToSyncQueue } from './syncQueue';

const LEAD_DAYS_DEFAULT = 14;
const DORMANT_THRESHOLD = 3;

function calculateNextDue(from: Date, interval: RecurrenceInterval, suggestedMonth?: number): string {
  if (suggestedMonth) {
    const next = new Date(from);
    next.setMonth(suggestedMonth - 1, 1); // JS months are 0-indexed
    next.setHours(9, 0, 0, 0);
    if (next <= from) next.setFullYear(next.getFullYear() + 1);
    return next.toISOString();
  }
  const next = new Date(from);
  switch (interval) {
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'six_monthly': next.setMonth(next.getMonth() + 6); break;
    case 'annual': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next.toISOString();
}

/**
 * Check if an active recurrence already exists for this customer + title + address.
 */
export async function hasActiveRecurrence(
  userId: string,
  customerId: string,
  title: string,
  address?: string,
): Promise<boolean> {
  const count = await db.recurring_jobs
    .where('user_id')
    .equals(userId)
    .filter((r) =>
      r.status === 'active' &&
      r.customer_id === customerId &&
      r.title === title &&
      (address ? r.address === address : true)
    )
    .count();
  return count > 0;
}

/**
 * Create a recurring job reminder from a completed job.
 */
export async function createRecurringJob(
  fromJob: Job,
  interval: RecurrenceInterval,
  options?: { suggestedMonth?: number },
): Promise<string> {
  const now = new Date();
  const nowIso = now.toISOString();
  const nextDue = calculateNextDue(now, interval, options?.suggestedMonth);

  const customer = await db.customers.get(fromJob.customer_id);
  const id = crypto.randomUUID();
  const record: RecurringJob = {
    id,
    user_id: fromJob.user_id,
    original_job_id: fromJob.id,
    customer_id: fromJob.customer_id,
    title: fromJob.title,
    address: customer?.address,
    interval,
    next_due_at: nextDue,
    reminder_lead_days: LEAD_DAYS_DEFAULT,
    status: 'active',
    contact_attempts: 0,
    suggested_month: options?.suggestedMonth,
    created_at: nowIso,
    updated_at: nowIso,
    _sync_status: 'pending',
  };
  await db.recurring_jobs.add(record);
  await addToSyncQueue('recurring_jobs', id, { ...record }, 'insert');
  return id;
}

/**
 * Get upcoming recurring jobs due within N days.
 */
export async function getUpcomingRecurringJobs(userId: string, withinDays = 14): Promise<Array<RecurringJob & { job?: Job }>> {
  const now = Date.now();
  const cutoff = now + withinDays * 24 * 60 * 60 * 1000;

  const all = await db.recurring_jobs
    .where('user_id')
    .equals(userId)
    .filter((r) => r.status === 'active')
    .toArray();

  const due = all.filter((r) => {
    const dueTime = new Date(r.next_due_at).getTime();
    return dueTime <= cutoff; // Due now or within the window
  });

  // Enrich with customer data
  const enriched: Array<RecurringJob & { job?: Job }> = [];
  for (const r of due) {
    const job = await db.jobs.get(r.original_job_id);
    enriched.push({ ...r, job });
  }

  // Sort by next_due_at ascending
  enriched.sort((a, b) => new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime());

  return enriched;
}

/**
 * Advance recurrence to next cycle. Called when Dave marks the recurring job as done.
 */
export async function advanceRecurrence(id: string): Promise<void> {
  const recurring = await db.recurring_jobs.get(id);
  if (!recurring) return;

  const now = new Date();
  const nextDue = calculateNextDue(now, recurring.interval, recurring.suggested_month);
  const nowIso = now.toISOString();

  await db.recurring_jobs.update(id, {
    next_due_at: nextDue,
    last_completed_at: nowIso,
    contact_attempts: 0,
    updated_at: nowIso,
    _sync_status: 'pending',
  });
  await addToSyncQueue('recurring_jobs', id, {
    next_due_at: nextDue, last_completed_at: nowIso, contact_attempts: 0, updated_at: nowIso,
  }, 'update');
}

/**
 * Cancel a recurrence.
 */
export async function cancelRecurrence(id: string, reason?: string): Promise<void> {
  const now = new Date().toISOString();
  await db.recurring_jobs.update(id, {
    status: 'cancelled',
    notes: reason,
    updated_at: now,
    _sync_status: 'pending',
  });
  await addToSyncQueue('recurring_jobs', id, {
    status: 'cancelled', notes: reason, updated_at: now,
  }, 'update');
}

/**
 * Update the interval and recalculate next due date.
 */
export async function updateRecurrenceInterval(id: string, newInterval: RecurrenceInterval): Promise<void> {
  const recurring = await db.recurring_jobs.get(id);
  if (!recurring) return;

  const now = new Date();
  const nextDue = calculateNextDue(now, newInterval, recurring.suggested_month);
  const nowIso = now.toISOString();

  await db.recurring_jobs.update(id, {
    interval: newInterval,
    next_due_at: nextDue,
    updated_at: nowIso,
    _sync_status: 'pending',
  });
  await addToSyncQueue('recurring_jobs', id, {
    interval: newInterval, next_due_at: nextDue, updated_at: nowIso,
  }, 'update');
}

/**
 * Increment contact attempt. Auto-moves to dormant after 3 attempts.
 */
export async function incrementContactAttempt(id: string): Promise<void> {
  const recurring = await db.recurring_jobs.get(id);
  if (!recurring) return;

  const newCount = recurring.contact_attempts + 1;
  const now = new Date().toISOString();
  const isDormant = newCount >= DORMANT_THRESHOLD;

  await db.recurring_jobs.update(id, {
    contact_attempts: newCount,
    status: isDormant ? 'dormant' : 'active',
    updated_at: now,
    _sync_status: 'pending',
  });
  await addToSyncQueue('recurring_jobs', id, {
    contact_attempts: newCount, status: isDormant ? 'dormant' : 'active', updated_at: now,
  }, 'update');
}

/**
 * Reactivate a dormant recurring job.
 */
export async function reactivateDormant(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.recurring_jobs.update(id, {
    status: 'active',
    contact_attempts: 0,
    updated_at: now,
    _sync_status: 'pending',
  });
  await addToSyncQueue('recurring_jobs', id, {
    status: 'active', contact_attempts: 0, updated_at: now,
  }, 'update');
}
