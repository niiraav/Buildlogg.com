/**
 * Template placeholder engine — fills {placeholders} in message templates
 * with real job/customer/profile data.
 */
import type { Job, Customer, Profile } from './db';

type PlaceholderFn = (job: Job, customer: Customer, profile: Profile, total: number) => string;

const PLACEHOLDERS: Record<string, PlaceholderFn> = {
  '{firstName}': (_, c) => c.name.split(' ')[0] || 'there',
  '{lastName}': (_, c) => c.name.split(' ').slice(1).join(' ') || '',
  '{jobTitle}': (j) => j.title,
  '{date}': (j) =>
    j.scheduled_start
      ? new Date(j.scheduled_start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
      : '[date not set]',
  '{time}': (j) =>
    j.scheduled_start
      ? new Date(j.scheduled_start).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
      : '[time not set]',
  '{address}': (_, c) => c.address || '[no address]',
  '{amount}': (_, __, ___, t) => `£${t.toFixed(2)}`,
  '{businessName}': (_, __, p) => p.business_name || p.full_name,
  '{jobNumber}': (j) => j.job_number || '',
};

export function fillTemplate(
  body: string,
  job: Job,
  customer: Customer,
  profile: Profile,
  total: number,
): string {
  let result = body;
  for (const [placeholder, fn] of Object.entries(PLACEHOLDERS)) {
    result = result.split(placeholder).join(fn(job, customer, profile, total));
  }
  return result;
}

export function getAvailablePlaceholders(): string[] {
  return Object.keys(PLACEHOLDERS);
}
