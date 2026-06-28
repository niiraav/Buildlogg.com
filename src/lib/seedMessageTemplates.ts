/**
 * Seed default message templates on first login.
 * Also provides seedMissingTemplates() for existing users who need new categories.
 */
import { db } from './db';
import { addToSyncQueue } from './syncQueue';
import type { MessageTemplate } from './db';

const DEFAULT_TEMPLATES: Array<Omit<MessageTemplate, 'id' | 'user_id' | 'created_at' | 'updated_at' | '_sync_status'>> = [
  {
    category: 'booking',
    name: 'Booking confirmation',
    body: 'Hi {firstName}, your {jobTitle} is confirmed for {date} at {time}. I\'ll be at {address}. See you then! — {businessName}',
    is_default: true,
    sort_order: 0,
  },
  {
    category: 'reminder',
    name: 'Day-before reminder',
    body: 'Hi {firstName}, just a reminder I\'m coming tomorrow at {time} for the {jobTitle}. — {businessName}',
    is_default: true,
    sort_order: 1,
  },
  {
    category: 'invoice',
    name: 'Invoice reminder',
    body: 'Hi {firstName}, the balance of {amount} is now due for the {jobTitle}. Please arrange payment at your earliest convenience. Thanks! — {businessName}',
    is_default: true,
    sort_order: 2,
  },
  {
    category: 'follow_up',
    name: 'Follow-up (stale quote)',
    body: 'Hi {firstName}, just following up on the quote I sent for the {jobTitle}. Happy to answer any questions. — {businessName}',
    is_default: true,
    sort_order: 3,
  },
  {
    category: 'review',
    name: 'Review request',
    body: 'Hi {firstName}, glad the {jobTitle} is sorted! If you were happy with the work, a quick Google review helps me a lot. Only takes 30 seconds. Thanks! — {businessName}\n\n{reviewLink}',
    is_default: true,
    sort_order: 4,
  },
  {
    category: 'receipt',
    name: 'Payment receipt',
    body: 'Hi {firstName}, payment of {amount} for {jobTitle} has been confirmed. Thanks for your business! — {businessName}',
    is_default: true,
    sort_order: 5,
  },
  {
    category: 'update',
    name: 'Job update',
    body: 'Hi {firstName}, just an update on your {jobTitle}. — {businessName}',
    is_default: true,
    sort_order: 6,
  },
];

export async function seedMessageTemplates(userId: string): Promise<number> {
  const existingCount = await db.message_templates.where('user_id').equals(userId).count();
  if (existingCount > 0) return 0;

  const now = new Date().toISOString();
  for (const tmpl of DEFAULT_TEMPLATES) {
    const id = crypto.randomUUID();
    const record: MessageTemplate = {
      ...tmpl,
      id,
      user_id: userId,
      created_at: now,
      updated_at: now,
      _sync_status: 'pending',
    };
    await db.message_templates.add(record);
    await addToSyncQueue('message_templates', id, { ...record }, 'insert');
  }
  return DEFAULT_TEMPLATES.length;
}

/**
 * Insert any missing default templates for existing users.
 * Checks each category individually and only inserts if no template
 * exists for that category yet. Also updates the review template
 * to include {reviewLink} on a separate line if the old version is found.
 */
export async function seedMissingTemplates(userId: string): Promise<number> {
  // Guard: only run once per user per device. The race condition between
  // this function and initialSync caused exponential template duplication.
  // Once templates exist (either from seeding or from Supabase sync), don't seed again.
  const flagKey = `buildlogg_templates_seeded_${userId}`;
  if (localStorage.getItem(flagKey) === 'true') return 0;

  let inserted = 0;
  const now = new Date().toISOString();

  for (const tmpl of DEFAULT_TEMPLATES) {
    const existing = await db.message_templates
      .where('user_id')
      .equals(userId)
      .filter((t) => t.category === tmpl.category)
      .count();

    if (existing === 0) {
      const id = crypto.randomUUID();
      const record: MessageTemplate = {
        ...tmpl,
        id,
        user_id: userId,
        created_at: now,
        updated_at: now,
        _sync_status: 'pending',
      };
      await db.message_templates.add(record);
      await addToSyncQueue('message_templates', id, { ...record }, 'insert');
      inserted++;
    }
  }

  // Update old review template to include {reviewLink} on a separate line
  const reviewTemplates = await db.message_templates
    .where('user_id')
    .equals(userId)
    .filter((t) => t.category === 'review' && !t.body.includes('{reviewLink}'))
    .toArray();

  for (const tmpl of reviewTemplates) {
    const updatedBody = tmpl.body + '\n\n{reviewLink}';
    await db.message_templates.update(tmpl.id, { body: updatedBody, updated_at: now, _sync_status: 'pending' });
    await addToSyncQueue('message_templates', tmpl.id, { body: updatedBody, updated_at: now }, 'update');
  }

  // Deduplicate is_default flags — ensure exactly one default per category
  await deduplicateDefaults(userId);

  // Mark as seeded so we don't run again (prevents race-condition duplicates)
  if (inserted > 0) {
    localStorage.setItem(flagKey, 'true');
  }

  return inserted;
}

/**
 * Ensure exactly one default template per category.
 * - If multiple templates have is_default=true in a category, keep the first
 *   (by sort_order) and unset the rest.
 * - If a category has templates but none with is_default=true, set the first
 *   one (by sort_order) as the default.
 * - If a category has no templates, skip (seedMissingTemplates handles it).
 * Idempotent — safe to run on every login.
 */
export async function deduplicateDefaults(userId: string): Promise<void> {
  const categories: MessageTemplate['category'][] = [
    'booking', 'reminder', 'invoice', 'follow_up', 'review', 'receipt', 'update', 'custom'
  ];
  const now = new Date().toISOString();

  for (const category of categories) {
    const templates = await db.message_templates
      .where('user_id')
      .equals(userId)
      .filter((t) => t.category === category)
      .sortBy('sort_order');

    if (templates.length === 0) continue;

    const defaults = templates.filter((t) => t.is_default);

    if (defaults.length > 1) {
      // Keep the first default, unset the rest
      const keepId = defaults[0].id;
      for (const tmpl of defaults) {
        if (tmpl.id === keepId) continue;
        await db.message_templates.update(tmpl.id, { is_default: false, updated_at: now, _sync_status: 'pending' });
        await addToSyncQueue('message_templates', tmpl.id, { is_default: false, updated_at: now }, 'update');
      }
    } else if (defaults.length === 0) {
      // No default — set the first template as default
      const tmpl = templates[0];
      await db.message_templates.update(tmpl.id, { is_default: true, updated_at: now, _sync_status: 'pending' });
      await addToSyncQueue('message_templates', tmpl.id, { is_default: true, updated_at: now }, 'update');
    }
  }
}

/**
 * Remove duplicate templates per category — keeps the default (or first by sort_order),
 * deletes the rest. Also cleans up the sync queue for deleted templates.
 * This fixes the bug where seedMissingTemplates + initialSync race condition
 * caused exponential duplication of templates across app sessions.
 */
export async function deduplicateTemplates(userId: string): Promise<number> {
  const categories: MessageTemplate['category'][] = [
    'booking', 'reminder', 'invoice', 'follow_up', 'review', 'receipt', 'update', 'custom'
  ];
  let deleted = 0;

  for (const category of categories) {
    const templates = await db.message_templates
      .where('user_id')
      .equals(userId)
      .filter((t) => t.category === category)
      .sortBy('sort_order');

    if (templates.length <= 1) continue;

    // Keep the default template (or first if no default), delete the rest
    const keep = templates.find((t) => t.is_default) || templates[0];
    const toDelete = templates.filter((t) => t.id !== keep.id);

    for (const tmpl of toDelete) {
      await db.message_templates.delete(tmpl.id);
      await addToSyncQueue('message_templates', tmpl.id, {}, 'delete');
      deleted++;
    }
  }

  return deleted;
}
