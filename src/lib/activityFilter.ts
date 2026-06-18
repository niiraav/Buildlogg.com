import type { WorkLogType, WorkLogEntry } from './db';

export type ActivityType = 'payment' | 'milestone' | 'quote' | 'lead' | 'cancellation';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  workLogType: WorkLogType;
  description: string;
  jobTitle: string;
  customerName: string;
  jobNumber?: string;
  amount: number;
  timestamp: Date;
  jobId: string;
}

export interface DaySummary {
  label: string;
  date: Date;
  events: ActivityEvent[];
  totalEarned: number;
  jobsCompleted: number;
  quotesSent: number;
  newLeads: number;
  cancellations: number;
}

/* ─── activity types Dave cares about ─── */

// Target statuses that represent business milestones (from "Status changed from X to Y")
const SIGNIFICANT_TARGET_STATUSES = [
  'paid',
  'completed',
  'booked',
  'no_show',
  'written_off',
  'cancelled',
  'awaiting_payment',
];

function parseTargetStatus(description: string): string | null {
  // Matches "Status changed from X to Y" or "Status changed from X to Y (by Z)"
  const match = description.match(/Status changed from \S+ to (\S+)/);
  return match ? match[1] : null;
}

function getActivityType(log: WorkLogEntry): ActivityType | null {
  const desc = log.description;
  const lower = desc.toLowerCase();

  // ─── Payment recorded / Deposit recorded ───
  // These are type: 'status_change' with description "Payment recorded — Cash · £X"
  // or "Deposit recorded — Cash · £X"
  if (lower.startsWith('payment recorded') || lower.startsWith('deposit recorded')) return 'payment';

  // ─── Payment method updated ───
  // Amendments should be visible in the activity feed so the audit trail is complete.
  if (lower.startsWith('payment method updated')) return 'milestone';

  // ─── Quote sent ───
  if (log.type === 'quote_sent') return 'quote';

  // ─── Quote accepted / booked ───
  if (lower.includes('quote accepted') || lower.includes('marked as booked')) return 'milestone';

  // ─── Job completed (payment pending) ───
  if (lower.includes('job completed') || lower.includes('payment pending')) return 'milestone';

  // ─── Cancellation / write-off ───
  if (lower.includes('cancelled') || lower.includes('written off')) return 'cancellation';

  // ─── No-show ───
  if (lower.includes('no-show')) return 'milestone';

  // ─── New leads ───
  if (lower.includes('missed call') || lower.includes('new enquiry') || lower.includes('enquiry received')) {
    return 'lead';
  }

  // ─── Status changed from X to Y ───
  // Parse the target status and check if it's significant
  if (lower.startsWith('status changed from')) {
    const targetStatus = parseTargetStatus(desc);
    if (!targetStatus) return null;

    // Job started (to in_progress) — Dave knows, he clicked it
    if (targetStatus === 'in_progress') return null;

    // To quoted — system action, not a manual milestone
    if (targetStatus === 'quoted') return null;

    // To enquiry — initial job creation, not a milestone
    if (targetStatus === 'enquiry') return null;

    // Payment method change — not a business milestone
    if (lower.includes('payment method updated')) return null;

    if (SIGNIFICANT_TARGET_STATUSES.includes(targetStatus)) {
      // For status changes to paid, check if there's a payment amount in the description
      if (targetStatus === 'paid') return 'payment';
      return 'milestone';
    }

    return null;
  }

  // ─── "Job started" — Dave knows, he clicked it ───
  if (lower === 'job started') return null;

  // ─── "Job marked as paid" — toast message, not a work log description
  // (The actual payment is logged as "Payment recorded — ...")

  // ─── Payment method updated — not a milestone ───
  if (lower.includes('payment method updated')) return null;

  return null;
}

export function isActivityEvent(log: WorkLogEntry): boolean {
  return getActivityType(log) !== null;
}

/* ─── filtering & enrichment ─── */

export function filterEvents(
  logs: WorkLogEntry[],
  jobMap: Map<string, { title: string; customerName: string; jobNumber?: string }>,
  maxAgeDays: number = 30
): ActivityEvent[] {
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000);

  return logs
    .filter((log) => isActivityEvent(log))
    .filter((log) => new Date(log.created_at) >= cutoff)
    .map((log) => {
      const job = jobMap.get(log.job_id);
      const activityType = getActivityType(log)!;

      let amount = log.amount ?? 0;

      // Extract amount from "Payment recorded — Cash · £X" or "Job completed — payment pending"
      if (activityType === 'payment' || activityType === 'milestone') {
        // Try to extract £X from the description
        const match = log.description.match(/£([\d,]+\.?\d{0,2})/);
        if (match) {
          amount = parseFloat(match[1].replace(',', ''));
        }
      }

      return {
        id: log.id,
        type: activityType,
        workLogType: log.type,
        description: log.description,
        jobTitle: job?.title ?? 'Unknown job',
        customerName: job?.customerName ?? 'Unknown customer',
        jobNumber: job?.jobNumber,
        amount,
        timestamp: new Date(log.created_at),
        jobId: log.job_id,
      };
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/* ─── grouping by day ─── */

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getDayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[date.getDay()];

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = todayStart.getTime() - dateStart.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 7) return dayName;

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function groupByDay(events: ActivityEvent[]): DaySummary[] {
  const days: DaySummary[] = [];
  let currentDay: DaySummary | null = null;

  for (const event of events) {
    if (!currentDay || !isSameDay(currentDay.date, event.timestamp)) {
      currentDay = {
        label: getDayLabel(event.timestamp),
        date: new Date(event.timestamp.getFullYear(), event.timestamp.getMonth(), event.timestamp.getDate()),
        events: [],
        totalEarned: 0,
        jobsCompleted: 0,
        quotesSent: 0,
        newLeads: 0,
        cancellations: 0,
      };
      days.push(currentDay);
    }

    currentDay.events.push(event);
    if (event.type === 'payment') currentDay.totalEarned += event.amount;
    if (event.type === 'milestone' && (event.description.toLowerCase().includes('completed') || event.description.toLowerCase().includes('job completed'))) {
      currentDay.jobsCompleted += 1;
    }
    if (event.type === 'quote') currentDay.quotesSent += 1;
    if (event.type === 'lead') currentDay.newLeads += 1;
    if (event.type === 'cancellation') currentDay.cancellations += 1;
  }

  return days;
}
