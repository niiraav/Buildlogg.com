/**
 * Seed default custom items for a new user based on their trade.
 * Called once after onboarding — skipped if the user already has items.
 */
import { db } from './db';
import { addToSyncQueue } from './syncQueue';
import { TRADE_TEMPLATES, BEAUTY_TEMPLATES, type TemplateSeed } from './tradeTemplates';

async function seedItems(userId: string, seeds: TemplateSeed[]): Promise<number> {
  const existingCount = await db.custom_items.where('user_id').equals(userId).count();
  if (existingCount > 0) return 0;

  const now = new Date().toISOString();
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const id = crypto.randomUUID();
    const item = {
      id,
      user_id: userId,
      description: seed.description,
      detail: seed.detail,
      amount: seed.amount,
      sort_order: i,
      created_at: now,
      updated_at: now,
      _sync_status: 'pending' as const,
    };
    await db.custom_items.add(item);
    await addToSyncQueue('custom_items', id, { ...item }, 'insert');
  }
  return seeds.length;
}

export async function seedTradeTemplates(userId: string, trade: string): Promise<number> {
  const seeds = TRADE_TEMPLATES[trade] || TRADE_TEMPLATES['other'];
  return seedItems(userId, seeds);
}

export async function seedBeautyTemplates(userId: string): Promise<number> {
  return seedItems(userId, BEAUTY_TEMPLATES);
}
