/**
 * Seed 5 default message templates on first login.
 * Only seeds if the user has no templates yet.
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
    body: 'Hi {firstName}, glad the {jobTitle} is sorted! If you were happy with the work, a quick Google review helps me a lot. Only takes 30 seconds. Thanks! — {businessName}',
    is_default: true,
    sort_order: 4,
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
