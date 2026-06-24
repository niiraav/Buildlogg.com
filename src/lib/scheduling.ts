/**
 * Scheduling conflict detection — checks for time overlaps
 * when booking a new job. Pure logic, no UI.
 */
import { db, type Job } from './db';

export interface SchedulingConflict {
  job: Job;
  conflictType: 'overlap' | 'back_to_back' | 'travel_time';
  message: string;
}

const BACK_TO_BACK_THRESHOLD_MIN = 15;
const TRAVEL_TIME_THRESHOLD_MIN = 30;

export async function detectConflicts(
  userId: string,
  newStart: string,
  newEnd: string,
  excludeJobId?: string,
): Promise<SchedulingConflict[]> {
  const start = new Date(newStart);
  const end = new Date(newEnd);
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);

  // Query jobs on the same day that have scheduled_start
  const allJobs = await db.jobs
    .where('user_id')
    .equals(userId)
    .toArray();

  const sameDayJobs = allJobs.filter((j) => {
    if (j.id === excludeJobId) return false;
    if (!j.scheduled_start) return false;
    const jStart = new Date(j.scheduled_start);
    return jStart >= dayStart && jStart <= dayEnd;
  });

  const conflicts: SchedulingConflict[] = [];

  for (const existing of sameDayJobs) {
    const exStart = new Date(existing.scheduled_start!);
    const exEnd = existing.scheduled_end ? new Date(existing.scheduled_end) : new Date(exStart.getTime() + 60 * 60 * 1000);

    // Check overlap
    if (start < exEnd && end > exStart) {
      conflicts.push({
        job: existing,
        conflictType: 'overlap',
        message: `Overlaps with "${existing.title}" (${exStart.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })})`,
      });
      continue;
    }

    // Check back-to-back (less than 15 min gap)
    const gapAfter = (exStart.getTime() - end.getTime()) / (1000 * 60);
    const gapBefore = (start.getTime() - exEnd.getTime()) / (1000 * 60);

    if (gapAfter > 0 && gapAfter < BACK_TO_BACK_THRESHOLD_MIN) {
      conflicts.push({
        job: existing,
        conflictType: 'back_to_back',
        message: `Only ${Math.round(gapAfter)} min before "${existing.title}" — tight schedule`,
      });
    } else if (gapBefore > 0 && gapBefore < BACK_TO_BACK_THRESHOLD_MIN) {
      conflicts.push({
        job: existing,
        conflictType: 'back_to_back',
        message: `Only ${Math.round(gapBefore)} min after "${existing.title}" — tight schedule`,
      });
    } else if (gapAfter > BACK_TO_BACK_THRESHOLD_MIN && gapAfter < TRAVEL_TIME_THRESHOLD_MIN) {
      conflicts.push({
        job: existing,
        conflictType: 'travel_time',
        message: `Only ${Math.round(gapAfter)} min before "${existing.title}" — may need travel time`,
      });
    } else if (gapBefore > BACK_TO_BACK_THRESHOLD_MIN && gapBefore < TRAVEL_TIME_THRESHOLD_MIN) {
      conflicts.push({
        job: existing,
        conflictType: 'travel_time',
        message: `Only ${Math.round(gapBefore)} min after "${existing.title}" — may need travel time`,
      });
    }
  }

  return conflicts;
}

export async function getJobsForDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<Job[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const allJobs = await db.jobs
    .where('user_id')
    .equals(userId)
    .toArray();

  return allJobs.filter((j) => {
    if (!j.scheduled_start) return false;
    const jStart = new Date(j.scheduled_start);
    return jStart >= start && jStart <= end;
  });
}

export function groupUnscheduledJobs(jobs: Job[]): Job[] {
  return jobs.filter((j) => !j.scheduled_start);
}
