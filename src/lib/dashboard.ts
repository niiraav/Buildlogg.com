/**
 * Revenue dashboard — computes stats from existing Dexie data.
 * No new tables, pure computation.
 */
import { db, type BookingRequest } from './db';
import { supabase } from './supabase';
import { referralLabel } from './referral';

export interface DashboardStats {
  monthEarnings: number;
  monthQuoted: number;
  winRate: number;
  outstandingTotal: number;
  outstandingCount: number;
  avgJobValue: number;
  topJobType: { title: string; earnings: number; count: number } | null;
  paymentMethodBreakdown: { cash: number; bank_transfer: number; terminal: number; other: number };
  lastMonthEarnings: number;
  reviewRequestsSent: number;
  monthExpenses: number;
  monthProfit: number;
  referral: ReferralBreakdown;
}

export interface ReferralBreakdown {
  bySource: { source: string; label: string; count: number }[];
  total: number;
  unknown: number;
}

function isSameMonth(date: Date, ref: Date): boolean {
  return date.getMonth() === ref.getMonth() && date.getFullYear() === ref.getFullYear();
}

/**
 * Fetch booking_requests from Supabase (online bookings arrive here, not via
 * Dexie sync which is push-only). Falls back to Dexie when offline.
 */
async function fetchBookingRequestsFromSupabase(userId: string): Promise<BookingRequest[]> {
  if (navigator.onLine) {
    try {
      const result = await Promise.race([
        supabase.from('booking_requests').select('*').eq('merchant_id', userId),
        new Promise<{ data: null; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        ),
      ]) as { data: BookingRequest[] | null; error: Error | null };
      if (!result.error && result.data) return result.data;
    } catch {
      // fall through to Dexie
    }
  }
  try {
    return await db.booking_requests.where('merchant_id').equals(userId).toArray();
  } catch {
    return [];
  }
}

/**
 * Referral breakdown — combines in-app (jobs) + online (booking_requests).
 * Excludes booking_requests with accepted_job_id set (dedup once accept ships).
 */
export async function getReferralBreakdown(userId: string): Promise<ReferralBreakdown> {
  const [jobs, bookings] = await Promise.all([
    db.jobs.where('user_id').equals(userId).filter((j) => !j.is_sample).toArray(),
    fetchBookingRequestsFromSupabase(userId),
  ]);

  const counts: Record<string, number> = {};
  let unknown = 0;

  const bump = (s?: string | null) => {
    if (s) counts[s] = (counts[s] || 0) + 1;
    else unknown++;
  };

  // In-app: jobs with referral_source
  jobs.forEach((j) => bump(j.referral_source));

  // Online: booking_requests with referral_source, EXCLUDING converted ones
  bookings
    .filter((b) => !b.accepted_job_id)
    .forEach((b) => bump(b.referral_source));

  const bySource = Object.entries(counts)
    .map(([source, count]) => ({ source, label: referralLabel(source), count }))
    .sort((a, b) => b.count - a.count);

  return {
    bySource,
    total: bySource.reduce((s, r) => s + r.count, 0),
    unknown,
  };
}

export async function getDashboardStats(userId: string, month?: Date): Promise<DashboardStats> {
  const ref = month || new Date();
  const lastMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);

  const allJobs = (await db.jobs.where('user_id').equals(userId).toArray()).filter(j => !j.is_sample);
  const allJobIds = allJobs.map((j) => j.id);
  const allPayments = allJobIds.length > 0
    ? await db.payments.where('job_id').anyOf(allJobIds).toArray()
    : [];

  // This month's earnings: payments recorded this month
  const monthPayments = allPayments.filter((p) => isSameMonth(new Date(p.recorded_at), ref));
  const monthEarnings = monthPayments.reduce((sum, p) => sum + p.amount, 0);

  // BN-2: Query expense work_log entries for this month
  const allWorkLogs = allJobIds.length > 0
    ? await db.work_log.where('job_id').anyOf(allJobIds).toArray()
    : [];
  const monthExpenses = allWorkLogs
    .filter(log => log.type === 'expense' && isSameMonth(new Date(log.created_at), ref))
    .reduce((sum, log) => sum + (log.amount || 0), 0);
  const monthProfit = monthEarnings - monthExpenses;

  // Last month's earnings for trend
  const lastMonthPayments = allPayments.filter((p) => isSameMonth(new Date(p.recorded_at), lastMonth));
  const lastMonthEarnings = lastMonthPayments.reduce((sum, p) => sum + p.amount, 0);

  // Win rate: quoted this month → booked this month
  const monthQuoted = allJobs.filter((j) => j.quote_sent_at && isSameMonth(new Date(j.quote_sent_at), ref)).length;
  const monthBooked = allJobs.filter((j) => {
    if (!j.quote_sent_at) return false;
    if (!isSameMonth(new Date(j.quote_sent_at), ref)) return false;
    return ['booked', 'in_progress', 'awaiting_payment', 'paid'].includes(j.status);
  }).length;
  const winRate = monthQuoted > 0 ? (monthBooked / monthQuoted) * 100 : 0;

  // Outstanding: awaiting_payment jobs
  const outstandingJobs = allJobs.filter((j) => j.status === 'awaiting_payment');
  const outstandingJobIds = outstandingJobs.map((j) => j.id);
  const outstandingItems = outstandingJobIds.length > 0
    ? await db.line_items.where('job_id').anyOf(outstandingJobIds).toArray()
    : [];
  const outstandingTotal = outstandingJobs.reduce((sum, j) => {
    const items = outstandingItems.filter((i) => i.job_id === j.id);
    const total = items.reduce((s, i) => s + i.amount, 0);
    const paid = allPayments.filter((p) => p.job_id === j.id).reduce((s, p) => s + p.amount, 0);
    return sum + Math.max(0, total - paid);
  }, 0);

  // Average job value
  const paidJobs = allJobs.filter((j) => j.status === 'paid');
  const paidJobIds = paidJobs.map((j) => j.id);
  const paidPayments = allPayments.filter((p) => paidJobIds.includes(p.job_id));
  const totalFromPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
  const avgJobValue = paidJobs.length > 0 ? totalFromPaid / paidJobs.length : 0;

  // Top job type (by earnings)
  const jobTypeMap: Record<string, { earnings: number; count: number }> = {};
  for (const job of paidJobs) {
    const key = job.title || 'Other';
    if (!jobTypeMap[key]) jobTypeMap[key] = { earnings: 0, count: 0 };
    const jobPayments = allPayments.filter((p) => p.job_id === job.id);
    jobTypeMap[key].earnings += jobPayments.reduce((s, p) => s + p.amount, 0);
    jobTypeMap[key].count += 1;
  }
  const topJobType = Object.entries(jobTypeMap)
    .map(([title, v]) => ({ title, ...v }))
    .sort((a, b) => b.earnings - a.earnings)[0] || null;

  // Payment method breakdown
  const paymentMethodBreakdown = {
    cash: monthPayments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
    bank_transfer: monthPayments.filter((p) => p.method === 'bank_transfer').reduce((s, p) => s + p.amount, 0),
    terminal: monthPayments.filter((p) => p.method === 'terminal').reduce((s, p) => s + p.amount, 0),
    other: monthPayments.filter((p) => p.method === 'other').reduce((s, p) => s + p.amount, 0),
  };

  // Referral breakdown (all-time, in-app + online)
  const referral = await getReferralBreakdown(userId);

  // Review requests sent this month
  const reviewRequestsSent = allJobs.filter(
    (j) => j.review_requested_at && isSameMonth(new Date(j.review_requested_at), ref)
  ).length;

  return {
    monthEarnings,
    monthQuoted,
    winRate,
    outstandingTotal,
    outstandingCount: outstandingJobs.length,
    avgJobValue,
    topJobType,
    paymentMethodBreakdown,
    lastMonthEarnings,
    reviewRequestsSent,
    monthExpenses,
    monthProfit,
    referral,
  };
}

export async function exportMonthlyCSV(userId: string, month?: Date): Promise<string> {
  const ref = month || new Date();
  // stats loaded separately
  const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
  const allJobIds = allJobs.map((j) => j.id);
  const allPayments = allJobIds.length > 0
    ? await db.payments.where('job_id').anyOf(allJobIds).toArray()
    : [];
  const allWorkLogs = allJobIds.length > 0
    ? await db.work_log.where('job_id').anyOf(allJobIds).toArray()
    : [];
  const customers = await db.customers.where('user_id').equals(userId).toArray();
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const monthJobs = allJobs.filter((j) => isSameMonth(new Date(j.created_at), ref));

  const headers = ['Date', 'Job Number', 'Customer', 'Title', 'Status', 'Quoted', 'Paid', 'Expenses', 'Method', 'Outstanding'];
  const rows = monthJobs.map((j) => {
    const jobPayments = allPayments.filter((p) => p.job_id === j.id);
    const paid = jobPayments.reduce((s, p) => s + p.amount, 0);
    const method = jobPayments.map((p) => p.method).join(', ') || '';
    const jobExpenses = allWorkLogs
      .filter(log => log.job_id === j.id && log.type === 'expense' && isSameMonth(new Date(log.created_at), ref))
      .reduce((sum, log) => sum + (log.amount || 0), 0);
    return [
      new Date(j.created_at).toLocaleDateString('en-GB'),
      j.job_number || '',
      customerMap.get(j.customer_id) || '',
      j.title,
      j.status,
      '', // Quoted amount - would need line items
      paid.toFixed(2),
      jobExpenses.toFixed(2),
      method,
      Math.max(0, 0 - paid).toFixed(2), // Simplified
    ];
  });

  const totalExpenses = allWorkLogs
    .filter(log => log.type === 'expense' && isSameMonth(new Date(log.created_at), ref))
    .reduce((sum, log) => sum + (log.amount || 0), 0);
  const summaryRow = ['', '', '', 'TOTAL EXPENSES', '', '', '', totalExpenses.toFixed(2), '', ''];
  return [headers, ...rows, summaryRow].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}
