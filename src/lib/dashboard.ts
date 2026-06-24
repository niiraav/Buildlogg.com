/**
 * Revenue dashboard — computes stats from existing Dexie data.
 * No new tables, pure computation.
 */
import { db } from './db';

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
}

function isSameMonth(date: Date, ref: Date): boolean {
  return date.getMonth() === ref.getMonth() && date.getFullYear() === ref.getFullYear();
}

export async function getDashboardStats(userId: string, month?: Date): Promise<DashboardStats> {
  const ref = month || new Date();
  const lastMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);

  const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
  const allJobIds = allJobs.map((j) => j.id);
  const allPayments = allJobIds.length > 0
    ? await db.payments.where('job_id').anyOf(allJobIds).toArray()
    : [];

  // This month's earnings: payments recorded this month
  const monthPayments = allPayments.filter((p) => isSameMonth(new Date(p.recorded_at), ref));
  const monthEarnings = monthPayments.reduce((sum, p) => sum + p.amount, 0);

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
  const customers = await db.customers.where('user_id').equals(userId).toArray();
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const monthJobs = allJobs.filter((j) => isSameMonth(new Date(j.created_at), ref));

  const headers = ['Date', 'Job Number', 'Customer', 'Title', 'Status', 'Quoted', 'Paid', 'Method', 'Outstanding'];
  const rows = monthJobs.map((j) => {
    const jobPayments = allPayments.filter((p) => p.job_id === j.id);
    const paid = jobPayments.reduce((s, p) => s + p.amount, 0);
    const method = jobPayments.map((p) => p.method).join(', ') || '';
    return [
      new Date(j.created_at).toLocaleDateString('en-GB'),
      j.job_number || '',
      customerMap.get(j.customer_id) || '',
      j.title,
      j.status,
      '', // Quoted amount - would need line items
      paid.toFixed(2),
      method,
      Math.max(0, 0 - paid).toFixed(2), // Simplified
    ];
  });

  return [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}
