import { db, type Job } from './db';

const PREFIX = 'J-';
const START = 1001;

function parseJobNumber(n: string): number {
  const num = parseInt(n.replace(PREFIX, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

export function formatJobNumber(num: number): string {
  return `${PREFIX}${String(num).padStart(4, '0')}`;
}

export async function nextJobNumber(userId: string): Promise<string> {
  const jobsWithNumbers = await db.jobs
    .where('user_id')
    .equals(userId)
    .and((j) => !!j.job_number)
    .toArray();

  const nums = jobsWithNumbers.map((j) => parseJobNumber(j.job_number!));
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
