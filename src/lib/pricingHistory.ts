/**
 * Historical pricing reference — queries past line items and jobs
 * to show Dave/Sophie what they've actually charged for similar work.
 * Session-cached to avoid repeated Dexie queries.
 */
import { db } from './db';

export interface PricingHistory {
  description: string;
  defaultAmount: number;
  minCharged: number;
  maxCharged: number;
  avgCharged: number;
  count: number;
  lastCharged: number;
  lastChargedDate: string;
  highVariance: boolean;
}

export interface JobTitlePricing {
  count: number;
  min: number;
  max: number;
  avg: number;
  highVariance: boolean;
}

const cache = new Map<string, PricingHistory | JobTitlePricing | null>();

function cacheKey(userId: string, type: 'item' | 'title', description: string): string {
  return `${userId}:${type}:${description.toLowerCase().trim()}`;
}

export function clearPricingCache(): void {
  cache.clear();
}

export async function getPricingHistory(userId: string, description: string): Promise<PricingHistory | null> {
  const key = cacheKey(userId, 'item', description);
  if (cache.has(key)) return cache.get(key) as PricingHistory | null;

  // Get the custom item default
  const customItem = await db.custom_items
    .where('user_id').equals(userId)
    .filter(ci => ci.description.toLowerCase() === description.toLowerCase().trim())
    .first();
  const defaultAmount = customItem?.amount || 0;

  // Query all real (non-sample) jobs
  const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
  const realJobIds = allJobs.filter(j => !j.is_sample).map(j => j.id);
  const allLineItems = realJobIds.length > 0
    ? await db.line_items.where('job_id').anyOf(realJobIds).toArray()
    : [];

  // Filter by description (case-insensitive, trimmed, amount > 0)
  const matching = allLineItems.filter(li =>
    li.description.trim().toLowerCase() === description.trim().toLowerCase() &&
    li.amount > 0
  );

  if (matching.length === 0 && defaultAmount === 0) {
    cache.set(key, null);
    return null;
  }

  const amounts = matching.map(li => li.amount);
  const sorted = [...amounts].sort((a, b) => a - b);
  const lastEntry = matching.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const minCharged = sorted[0] || 0;
  const maxCharged = sorted[sorted.length - 1] || 0;
  const highVariance = amounts.length > 1 && (maxCharged - minCharged) > 3 * minCharged;

  const result: PricingHistory = {
    description,
    defaultAmount,
    minCharged,
    maxCharged,
    avgCharged: amounts.length > 0 ? amounts.reduce((s, a) => s + a, 0) / amounts.length : 0,
    count: amounts.length,
    lastCharged: lastEntry?.amount || 0,
    lastChargedDate: lastEntry?.created_at || '',
    highVariance,
  };

  cache.set(key, result);
  return result;
}

export async function getJobTitlePricingHistory(userId: string, jobTitle: string): Promise<JobTitlePricing | null> {
  const key = cacheKey(userId, 'title', jobTitle);
  if (cache.has(key)) return cache.get(key) as JobTitlePricing | null;

  if (!jobTitle.trim()) {
    cache.set(key, null);
    return null;
  }

  const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
  const realJobs = allJobs.filter(j => !j.is_sample && j.title);
  const matching = realJobs.filter(j =>
    j.title!.toLowerCase().includes(jobTitle.toLowerCase()) ||
    jobTitle.toLowerCase().includes(j.title!.toLowerCase())
  );

  if (matching.length === 0) {
    cache.set(key, null);
    return null;
  }

  const jobIds = matching.map(j => j.id);
  const items = await db.line_items.where('job_id').anyOf(jobIds).toArray();
  const totals = matching.map(j => {
    const jobItems = items.filter(i => i.job_id === j.id);
    return jobItems.reduce((s, i) => s + i.amount, 0);
  }).filter(t => t > 0);

  if (totals.length === 0) {
    cache.set(key, null);
    return null;
  }

  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const highVariance = totals.length > 1 && (max - min) > 3 * min;

  const result: JobTitlePricing = {
    count: totals.length,
    min,
    max,
    avg: totals.reduce((s, t) => s + t, 0) / totals.length,
    highVariance,
  };

  cache.set(key, result);
  return result;
}
