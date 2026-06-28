/**
 * Template placeholder engine — fills {placeholders} in message templates
 * with real job/customer/profile data.
 */
import type { Job, Customer, Profile, MessageTemplate, TemplateCategory } from './db';
import { db } from './db';
import { addToSyncQueue } from './syncQueue';

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
  '{bookingLink}': (_, __, p) => p.booking_slug && p.booking_enabled ? `https://buildlogg.com/book/${p.booking_slug}` : '',
  '{reviewLink}': (_, __, p) => p.google_business_url || '',
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

/**
 * Get the default template for a given category.
 * Returns the first template with is_default=true for that category,
 * or the first template for that category if none is marked default,
 * or null if no templates exist for that category.
 */
export async function getDefaultTemplate(
  userId: string,
  category: TemplateCategory,
): Promise<MessageTemplate | null> {
  const templates = await db.message_templates
    .where('user_id')
    .equals(userId)
    .filter((t) => t.category === category)
    .sortBy('sort_order');

  if (templates.length === 0) return null;
  return templates.find((t) => t.is_default) || templates[0];
}

/**
 * Get a filled message from the default template for a category.
 * Falls back to fallbackText if no template is found.
 */
export async function getFilledTemplateMessage(
  userId: string,
  category: TemplateCategory,
  job: Job,
  customer: Customer,
  profile: Profile,
  total: number,
  fallbackText: string,
): Promise<string> {
  const template = await getDefaultTemplate(userId, category);
  if (!template) return fallbackText;
  return fillTemplate(template.body, job, customer, profile, total);
}

/**
 * Set one template as the default for its category.
 * Unsets is_default on all other templates in the same category.
 * Updates Dexie + sync queue for each changed template.
 */
export async function setDefaultForCategory(
  userId: string,
  templateId: string,
  category: TemplateCategory,
): Promise<void> {
  const all = await db.message_templates
    .where('user_id')
    .equals(userId)
    .filter((t) => t.category === category)
    .toArray();

  const now = new Date().toISOString();
  for (const tmpl of all) {
    const shouldBeDefault = tmpl.id === templateId;
    if (tmpl.is_default === shouldBeDefault) continue; // No change needed
    await db.message_templates.update(tmpl.id, {
      is_default: shouldBeDefault,
      updated_at: now,
      _sync_status: 'pending',
    });
    await addToSyncQueue(
      'message_templates',
      tmpl.id,
      { is_default: shouldBeDefault, updated_at: now },
      'update',
    );
  }
}

/**
 * Check if any template in a category is marked as default.
 */
export async function hasDefaultForCategory(
  userId: string,
  category: TemplateCategory,
): Promise<boolean> {
  const count = await db.message_templates
    .where('user_id')
    .equals(userId)
    .filter((t) => t.category === category && t.is_default)
    .count();
  return count > 0;
}
