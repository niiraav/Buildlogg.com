/**
 * Business Insights & Coaching (W3-3) — insight computation engine.
 *
 * Pure functions over existing Dexie data. No new tables, no network calls.
 * Session-cached (Map keyed by userId:YYYY-MM), same pattern as pricingHistory.ts.
 *
 * Insights accept the already-loaded DashboardStats to reuse this-month values.
 * Historical queries (last month's win rate, stale quotes, etc.) re-query Dexie
 * — acceptable for v1 (typical dataset <500 jobs, <50ms).
 *
 * CRITICAL: ALL Dexie queries in this file must filter !j.is_sample.
 * The seeded sample job has realistic quotes, payments, and statuses that
 * would pollute insights without this filter.
 */
import { db } from './db';
import { daysBetween } from './jobStaleness';
import type { DashboardStats } from './dashboard';

/* ─── Types ─── */

export type InsightSeverity = 'positive' | 'warning' | 'info';

export type InsightType =
  | 'win_rate_drop'
  | 'profit_margin'
  | 'revenue_day'
  | 'stale_quote_cost'
  | 'avg_job_value_up'
  | 'slow_payer';

export interface Insight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaRoute?: string;
  priority: number; // lower = higher priority
}

/* ─── Constants (easily tuned) ─── */

const WIN_RATE_DROP_PCT = 15;        // percentage-point drop threshold
const WIN_RATE_MIN_QUOTES = 3;       // min quotes this month for insight to fire
const PROFIT_MARGIN_THRESHOLD = 0.4; // 40% — below this, warn
const REVENUE_DAY_MIN_JOBS = 4;     // min paid jobs for day-of-week insight
const STALE_QUOTE_DAYS = 5;         // quotes older than this are "stale"
const AVG_VALUE_UP_PCT = 0.2;       // 20% increase threshold
const SLOW_PAYER_DAYS = 14;         // awaiting_payment older than this = slow

const WON_STATUSES = ['booked', 'in_progress', 'awaiting_payment', 'paid'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ─── Session cache ─── */

const cache = new Map<string, Insight[]>();

function cacheKey(userId: string, ref: Date): string {
  return `${userId}:${ref.getFullYear()}-${ref.getMonth()}`;
}

export function clearInsightsCache(): void {
  cache.clear();
}

/* ─── Helpers ─── */

function isSameMonth(dateStr: string, ref: Date): boolean {
  const d = new Date(dateStr);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

function isPrevMonth(dateStr: string, ref: Date): boolean {
  const d = new Date(dateStr);
  const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
}

function fmtGBP(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

function monthSuffix(ref: Date): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
}

/* ─── Individual insight generators ─── */

/**
 * 1. Win rate drop — compares this month's win rate to last month's.
 * Needs last month's quoted + booked counts (not in DashboardStats).
 */
async function checkWinRateDrop(
  userId: string,
  stats: DashboardStats,
  ref: Date,
): Promise<Insight | null> {
  if (stats.monthQuoted < WIN_RATE_MIN_QUOTES) return null;

  const allJobs = await db.jobs
    .where('user_id')
    .equals(userId)
    .filter((j) => !j.is_sample && j.quote_sent_at != null)
    .toArray();

  const lastMonthQuoted = allJobs.filter((j) => j.quote_sent_at && isPrevMonth(j.quote_sent_at, ref)).length;
  if (lastMonthQuoted === 0) return null;

  const lastMonthBooked = allJobs.filter((j) => {
    if (!j.quote_sent_at || !isPrevMonth(j.quote_sent_at, ref)) return false;
    return WON_STATUSES.includes(j.status);
  }).length;

  const lastMonthWinRate = (lastMonthBooked / lastMonthQuoted) * 100;
  const drop = lastMonthWinRate - stats.winRate;

  if (drop < WIN_RATE_DROP_PCT) return null;

  return {
    id: `win_rate_drop_${monthSuffix(ref)}`,
    type: 'win_rate_drop',
    severity: 'warning',
    title: 'Win rate dropped',
    body: `Your win rate went from ${lastMonthWinRate.toFixed(0)}% to ${stats.winRate.toFixed(0)}% — are you pricing too high?`,
    priority: 10,
  };
}

/**
 * 2. Profit margin — uses DashboardStats directly, no extra queries.
 */
function checkProfitMargin(stats: DashboardStats, ref: Date): Insight | null {
  if (stats.monthEarnings <= 0 || stats.monthExpenses <= 0) return null;

  const margin = stats.monthProfit / stats.monthEarnings;
  if (margin >= PROFIT_MARGIN_THRESHOLD) return null;

  const expensePct = Math.round((stats.monthExpenses / stats.monthEarnings) * 100);

  return {
    id: `profit_margin_${monthSuffix(ref)}`,
    type: 'profit_margin',
    severity: 'warning',
    title: 'Materials eating your margin',
    body: `Expenses are ${expensePct}% of your revenue this month (${fmtGBP(stats.monthExpenses)} of ${fmtGBP(stats.monthEarnings)}). Your profit is ${fmtGBP(stats.monthProfit)}.`,
    priority: 20,
  };
}

/**
 * 3. Most/least revenue day — groups paid jobs by day-of-week.
 * Computes revenue (not profit — per-job expense data deferred to v2).
 */
async function checkRevenueDay(
  userId: string,
  ref: Date,
): Promise<Insight | null> {
  const paidJobs = await db.jobs
    .where('user_id')
    .equals(userId)
    .filter((j) => !j.is_sample && j.status === 'paid' && j.actual_start != null)
    .toArray();

  const monthPaid = paidJobs.filter((j) => j.actual_start && isSameMonth(j.actual_start, ref));
  if (monthPaid.length < REVENUE_DAY_MIN_JOBS) return null;

  const jobIds = monthPaid.map((j) => j.id);
  const payments = jobIds.length > 0
    ? await db.payments.where('job_id').anyOf(jobIds).toArray()
    : [];

  const dayRevenue: Record<number, { total: number; count: number }> = {};
  for (const job of monthPaid) {
    const day = new Date(job.actual_start!).getDay();
    if (!dayRevenue[day]) dayRevenue[day] = { total: 0, count: 0 };
    const jobPayments = payments.filter((p) => p.job_id === job.id);
    dayRevenue[day].total += jobPayments.reduce((s, p) => s + p.amount, 0);
    dayRevenue[day].count += 1;
  }

  const entries = Object.entries(dayRevenue).map(([day, v]) => ({ day: Number(day), ...v }));
  if (entries.length < 2) return null; // need at least 2 different days

  entries.sort((a, b) => b.total - a.total);
  const best = entries[0];
  const worst = entries[entries.length - 1];

  if (best.total === worst.total) return null; // no difference to report

  return {
    id: `revenue_day_${monthSuffix(ref)}`,
    type: 'revenue_day',
    severity: 'info',
    title: 'Your most profitable day',
    body: `${DAY_NAMES[best.day]} is your top revenue day (${fmtGBP(best.total)} across ${best.count} job${best.count !== 1 ? 's' : ''}). ${DAY_NAMES[worst.day]} is lowest (${fmtGBP(worst.total)}).`,
    priority: 40,
  };
}

/**
 * 4. Stale quote cost — quoted jobs older than 5 days, summed value.
 */
async function checkStaleQuoteCost(userId: string, ref: Date): Promise<Insight | null> {
  const quotedJobs = await db.jobs
    .where('user_id')
    .equals(userId)
    .filter((j) => !j.is_sample && j.status === 'quoted' && j.quote_sent_at != null)
    .toArray();

  const stale = quotedJobs.filter((j) => daysBetween(j.quote_sent_at!) >= STALE_QUOTE_DAYS);
  if (stale.length === 0) return null;

  const staleIds = stale.map((j) => j.id);
  const items = staleIds.length > 0
    ? await db.line_items.where('job_id').anyOf(staleIds).toArray()
    : [];

  const totalValue = stale.reduce((sum, j) => {
    const jobItems = items.filter((i) => i.job_id === j.id);
    return sum + jobItems.reduce((s, i) => s + i.amount, 0);
  }, 0);

  if (totalValue <= 0) return null;

  return {
    id: `stale_quote_cost_${monthSuffix(ref)}`,
    type: 'stale_quote_cost',
    severity: 'info',
    title: 'Quotes going cold',
    body: `You have ${stale.length} quote${stale.length !== 1 ? 's' : ''} worth ${fmtGBP(totalValue)} that haven't been followed up in ${STALE_QUOTE_DAYS}+ days.`,
    ctaLabel: 'Review quotes',
    ctaRoute: '/',
    priority: 30,
  };
}

/**
 * 5. Avg job value up — compares this month's avg to last month's.
 */
async function checkAvgJobValueUp(
  userId: string,
  stats: DashboardStats,
  ref: Date,
): Promise<Insight | null> {
  if (stats.avgJobValue <= 0) return null;

  const allJobs = await db.jobs
    .where('user_id')
    .equals(userId)
    .filter((j) => !j.is_sample && j.status === 'paid')
    .toArray();

  const lastMonthPaid = allJobs.filter((j) => isPrevMonth(j.created_at, ref));
  if (lastMonthPaid.length === 0) return null;

  const lastMonthIds = lastMonthPaid.map((j) => j.id);
  const payments = lastMonthIds.length > 0
    ? await db.payments.where('job_id').anyOf(lastMonthIds).toArray()
    : [];

  const lastMonthTotal = payments.reduce((s, p) => s + p.amount, 0);
  const lastMonthAvg = lastMonthTotal / lastMonthPaid.length;
  if (lastMonthAvg <= 0) return null;

  const increase = (stats.avgJobValue - lastMonthAvg) / lastMonthAvg;
  if (increase < AVG_VALUE_UP_PCT) return null;

  return {
    id: `avg_job_value_up_${monthSuffix(ref)}`,
    type: 'avg_job_value_up',
    severity: 'positive',
    title: 'Bigger jobs coming in',
    body: `Your average job value went from ${fmtGBP(lastMonthAvg)} to ${fmtGBP(stats.avgJobValue)} — you're quoting bigger work.`,
    priority: 50,
  };
}

/**
 * 6. Slow payer — awaiting_payment jobs with actual_end older than 14 days.
 */
async function checkSlowPayer(userId: string, ref: Date): Promise<Insight | null> {
  const overdueJobs = await db.jobs
    .where('user_id')
    .equals(userId)
    .filter((j) => !j.is_sample && j.status === 'awaiting_payment' && j.actual_end != null)
    .toArray();

  const slow = overdueJobs
    .map((j) => ({ job: j, days: daysBetween(j.actual_end!) }))
    .filter((x) => x.days >= SLOW_PAYER_DAYS)
    .sort((a, b) => b.days - a.days);

  if (slow.length === 0) return null;

  const worst = slow[0];
  const customer = await db.customers.get(worst.job.customer_id);
  const name = customer?.name || 'A customer';

  // Compute outstanding for the worst job
  const worstItems = await db.line_items.where('job_id').equals(worst.job.id).toArray();
  const worstPayments = await db.payments.where('job_id').equals(worst.job.id).toArray();
  const total = worstItems.reduce((s, i) => s + i.amount, 0);
  const paid = worstPayments.reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.max(0, total - paid);

  const extra = slow.length > 1 ? ` ${slow.length - 1} more overdue job${slow.length - 1 !== 1 ? 's' : ''}.` : '';

  return {
    id: `slow_payer_${monthSuffix(ref)}`,
    type: 'slow_payer',
    severity: 'warning',
    title: 'Payment overdue',
    body: `${name} is at ${worst.days} days — ${fmtGBP(outstanding)} outstanding. Consider chasing.${extra}`,
    ctaLabel: 'Chase payment',
    ctaRoute: '/jobs?filter=unpaid',
    priority: 15,
  };
}

/* ─── Main entry point ─── */

export async function generateInsights(
  userId: string,
  stats: DashboardStats,
): Promise<Insight[]> {
  const ref = new Date();
  const key = cacheKey(userId, ref);
  if (cache.has(key)) return cache.get(key)!;

  const results: Insight[] = [];

  // Each insight wrapped in try/catch — one failure doesn't block others
  const generators: Array<() => Promise<Insight | null>> = [
    () => checkWinRateDrop(userId, stats, ref).catch(() => null),
    () => Promise.resolve(checkProfitMargin(stats, ref)),
    () => checkRevenueDay(userId, ref).catch(() => null),
    () => checkStaleQuoteCost(userId, ref).catch(() => null),
    () => checkAvgJobValueUp(userId, stats, ref).catch(() => null),
    () => checkSlowPayer(userId, ref).catch(() => null),
  ];

  for (const gen of generators) {
    try {
      const insight = await gen();
      if (insight) results.push(insight);
    } catch {
      // Swallow — partial failure is fine
    }
  }

  // Sort: warnings first (by priority), then info, then positive
  const severityOrder: Record<InsightSeverity, number> = { warning: 0, info: 1, positive: 2 };
  results.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.priority - b.priority;
  });

  cache.set(key, results);
  return results;
}
