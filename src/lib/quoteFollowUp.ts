/**
 * P2-01: Automated Quote Follow-Up engine.
 * Creates follow-up reminders 48h after a quote is sent.
 * Pure logic over Dexie — no UI.
 */
import { db, type Job, type QuoteFollowUp } from './db';
import { addToSyncQueue } from './syncQueue';

const FOLLOW_UP_DELAY_HOURS = 48;
const MAX_NUDGES = 3;

const SNOOZE_OPTIONS = {
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '2w': 14 * 24 * 60 * 60 * 1000,
} as const;

export type SnoozeDuration = keyof typeof SNOOZE_OPTIONS;

/**
 * Create or reset a follow-up when a quote is sent.
 * If a record already exists for this job, resets nudge_count and first_nudge_at.
 */
export async function createQuoteFollowUp(jobId: string, userId: string): Promise<void> {
  const now = new Date();
  const nudgeAt = new Date(now.getTime() + FOLLOW_UP_DELAY_HOURS * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const nudgeIso = nudgeAt.toISOString();

  const existing = await db.quote_follow_ups.where('job_id').equals(jobId).first();
  if (existing) {
    await db.quote_follow_ups.update(existing.id, {
      status: 'pending',
      nudge_count: 0,
      first_nudge_at: nudgeIso,
      snooze_until: undefined,
      snooze_reason: undefined,
      updated_at: nowIso,
      _sync_status: 'pending',
    });
    await addToSyncQueue('quote_follow_ups', existing.id, {
      status: 'pending', nudge_count: 0, first_nudge_at: nudgeIso,
      updated_at: nowIso,
    }, 'update');
  } else {
    const id = crypto.randomUUID();
    const record: QuoteFollowUp = {
      id,
      job_id: jobId,
      user_id: userId,
      status: 'pending',
      first_nudge_at: nudgeIso,
      nudge_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
      _sync_status: 'pending',
    };
    await db.quote_follow_ups.add(record);
    await addToSyncQueue('quote_follow_ups', id, { ...record }, 'insert');
  }
}

/**
 * Get all due follow-ups for a user.
 * Returns pending follow-ups where first_nudge_at <= now and not snoozed.
 * Filters out follow-ups whose job is no longer 'quoted' status.
 */
export async function getDueQuoteFollowUps(userId: string): Promise<Array<QuoteFollowUp & { job?: Job }>> {
  const now = Date.now();
  const all = await db.quote_follow_ups
    .where('user_id')
    .equals(userId)
    .filter((f) => f.status === 'pending')
    .toArray();

  const due: Array<QuoteFollowUp & { job?: Job }> = [];

  for (const followUp of all) {
    // Check if nudge time has arrived
    if (new Date(followUp.first_nudge_at).getTime() > now) continue;

    // Check snooze
    if (followUp.snooze_until && new Date(followUp.snooze_until).getTime() > now) continue;

    // Check if job is still 'quoted'
    const job = await db.jobs.get(followUp.job_id);
    if (!job || job.status !== 'quoted') {
      // Auto-respond if job moved on
      await markQuoteResponded(followUp.job_id);
      continue;
    }

    due.push({ ...followUp, job });
  }

  // Sort by first_nudge_at ascending (oldest first)
  due.sort((a, b) => new Date(a.first_nudge_at).getTime() - new Date(b.first_nudge_at).getTime());

  return due;
}

/**
 * Snooze a follow-up.
 */
export async function snoozeFollowUp(id: string, duration: SnoozeDuration, reason?: string): Promise<void> {
  const now = new Date();
  const snoozeUntil = new Date(now.getTime() + SNOOZE_OPTIONS[duration]);
  const nowIso = now.toISOString();

  await db.quote_follow_ups.update(id, {
    status: 'snoozed',
    snooze_until: snoozeUntil.toISOString(),
    snooze_reason: reason,
    updated_at: nowIso,
    _sync_status: 'pending',
  });
  await addToSyncQueue('quote_follow_ups', id, {
    status: 'snoozed', snooze_until: snoozeUntil.toISOString(),
    snooze_reason: reason, updated_at: nowIso,
  }, 'update');
}

/**
 * Mark a follow-up as responded (customer replied).
 * Called automatically when job transitions from quoted → booked.
 */
export async function markQuoteResponded(jobId: string): Promise<void> {
  const followUps = await db.quote_follow_ups.where('job_id').equals(jobId).toArray();
  const now = new Date().toISOString();

  for (const f of followUps) {
    if (f.status === 'responded' || f.status === 'dismissed') continue;
    await db.quote_follow_ups.update(f.id, {
      status: 'responded',
      updated_at: now,
      _sync_status: 'pending',
    });
    await addToSyncQueue('quote_follow_ups', f.id, { status: 'responded', updated_at: now }, 'update');
  }
}

/**
 * Dismiss a follow-up permanently.
 */
export async function dismissFollowUp(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.quote_follow_ups.update(id, {
    status: 'dismissed',
    updated_at: now,
    _sync_status: 'pending',
  });
  await addToSyncQueue('quote_follow_ups', id, { status: 'dismissed', updated_at: now }, 'update');
}

/**
 * Increment nudge count. Auto-dismisses after MAX_NUDGES.
 */
export async function incrementNudge(id: string): Promise<void> {
  const followUp = await db.quote_follow_ups.get(id);
  if (!followUp) return;

  const newCount = followUp.nudge_count + 1;
  const now = new Date().toISOString();

  if (newCount >= MAX_NUDGES) {
    await db.quote_follow_ups.update(id, {
      nudge_count: newCount,
      last_nudge_at: now,
      status: 'dismissed',
      updated_at: now,
      _sync_status: 'pending',
    });
    await addToSyncQueue('quote_follow_ups', id, {
      nudge_count: newCount, last_nudge_at: now, status: 'dismissed', updated_at: now,
    }, 'update');
  } else {
    await db.quote_follow_ups.update(id, {
      nudge_count: newCount,
      last_nudge_at: now,
      updated_at: now,
      _sync_status: 'pending',
    });
    await addToSyncQueue('quote_follow_ups', id, {
      nudge_count: newCount, last_nudge_at: now, updated_at: now,
    }, 'update');
  }
}
