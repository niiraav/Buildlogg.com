/**
 * P2-03: Overdue Payment Escalation engine.
 * Creates a 4-stage escalation ladder when a job goes to awaiting_payment.
 * Pure logic over Dexie — no UI.
 */
import { db, type Job, type PaymentChase, type ChaseStage } from './db';
import { addToSyncQueue } from './syncQueue';

const STAGE_DELAYS = {
  gentle: 7 * 24 * 60 * 60 * 1000,
  firm: 14 * 24 * 60 * 60 * 1000,
  final: 30 * 24 * 60 * 60 * 1000,
  small_claims: 60 * 24 * 60 * 60 * 1000,
};

const STAGES: ChaseStage[] = ['gentle', 'firm', 'final', 'small_claims'];

/**
 * Create 4 chase records when a job first transitions to awaiting_payment.
 * Uses actual_end as the escalation clock start (or updated_at as fallback).
 * Guard: if chases already exist for this job, don't create duplicates.
 */
export async function createPaymentChases(jobId: string, userId: string, clockStartAt: string): Promise<void> {
  // Check if chases already exist
  const existing = await db.payment_chases.where('job_id').equals(jobId).count();
  if (existing > 0) return;

  const startTime = new Date(clockStartAt).getTime();
  const now = new Date().toISOString();

  for (const stage of STAGES) {
    const dueAt = new Date(startTime + STAGE_DELAYS[stage]).toISOString();
    const id = crypto.randomUUID();
    const record: PaymentChase = {
      id,
      job_id: jobId,
      user_id: userId,
      stage,
      due_at: dueAt,
      status: 'pending',
      created_at: now,
      updated_at: now,
      _sync_status: 'pending',
    };
    await db.payment_chases.add(record);
    await addToSyncQueue('payment_chases', id, { ...record }, 'insert');
  }
}

/**
 * Get all due payment chases for a user.
 * Returns pending chases where due_at <= now.
 */
export async function getDuePaymentChases(userId: string): Promise<Array<PaymentChase & { job?: Job }>> {
  const now = Date.now();
  const all = await db.payment_chases
    .where('user_id')
    .equals(userId)
    .filter((c) => c.status === 'pending')
    .toArray();

  const due: Array<PaymentChase & { job?: Job }> = [];

  for (const chase of all) {
    if (new Date(chase.due_at).getTime() > now) continue;

    // Check if job is still awaiting_payment
    const job = await db.jobs.get(chase.job_id);
    if (!job || job.status !== 'awaiting_payment') {
      // Auto-resolve if job moved on
      await resolveChases(chase.job_id);
      continue;
    }

    due.push({ ...chase, job });
  }

  // Sort by due_at ascending (most overdue first)
  due.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  return due;
}

/**
 * Mark a chase as sent.
 */
export async function markChaseSent(id: string, method: 'whatsapp' | 'sms'): Promise<void> {
  const now = new Date().toISOString();
  await db.payment_chases.update(id, {
    status: 'sent',
    sent_at: now,
    message_method: method,
    updated_at: now,
    _sync_status: 'pending',
  });
  await addToSyncQueue('payment_chases', id, {
    status: 'sent', sent_at: now, message_method: method, updated_at: now,
  }, 'update');
}

/**
 * Mark a specific stage as sent for a job (when Dave sends a manual reminder).
 */
export async function markStageSentByJob(jobId: string, stage: ChaseStage, method: 'whatsapp' | 'sms'): Promise<void> {
  const chases = await db.payment_chases
    .where('job_id')
    .equals(jobId)
    .filter((c) => c.stage === stage && c.status === 'pending')
    .toArray();

  for (const chase of chases) {
    await markChaseSent(chase.id, method);
  }
}

/**
 * Pause all pending chases for a job.
 */
export async function pauseChase(jobId: string, reason: string): Promise<void> {
  const chases = await db.payment_chases.where('job_id').equals(jobId).toArray();
  const now = new Date().toISOString();

  for (const c of chases) {
    if (c.status !== 'pending') continue;
    await db.payment_chases.update(c.id, {
      status: 'paused',
      pause_reason: reason,
      updated_at: now,
      _sync_status: 'pending',
    });
    await addToSyncQueue('payment_chases', c.id, {
      status: 'paused', pause_reason: reason, updated_at: now,
    }, 'update');
  }
}

/**
 * Resume paused chases for a job.
 */
export async function resumeChase(jobId: string): Promise<void> {
  const chases = await db.payment_chases.where('job_id').equals(jobId).toArray();
  const now = new Date().toISOString();

  for (const c of chases) {
    if (c.status !== 'paused') continue;
    await db.payment_chases.update(c.id, {
      status: 'pending',
      pause_reason: undefined,
      updated_at: now,
      _sync_status: 'pending',
    });
    await addToSyncQueue('payment_chases', c.id, {
      status: 'pending', updated_at: now,
    }, 'update');
  }
}

/**
 * Resolve all chases for a job. Called when job → paid.
 */
export async function resolveChases(jobId: string): Promise<void> {
  const chases = await db.payment_chases.where('job_id').equals(jobId).toArray();
  const now = new Date().toISOString();

  for (const c of chases) {
    if (c.status === 'resolved') continue;
    await db.payment_chases.update(c.id, {
      status: 'resolved',
      updated_at: now,
      _sync_status: 'pending',
    });
    await addToSyncQueue('payment_chases', c.id, {
      status: 'resolved', updated_at: now,
    }, 'update');
  }
}

/**
 * Pause all chases when job goes back to in_progress.
 */
export async function pauseChasesOnStatusChange(jobId: string): Promise<void> {
  await pauseChase(jobId, 'Job status changed — redoing work');
}
