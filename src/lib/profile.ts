/**
 * Shared profile persistence helpers.
 * Extracted from Settings/index.tsx so the Booking screen (and future screens)
 * can update profile fields without duplicating the Dexie + sync-queue logic.
 */
import { db, type Profile } from './db';

function now(): string {
  return new Date().toISOString();
}

/**
 * Update one or more profile fields in Dexie + queue a sync to Supabase.
 * Returns the full updated profile (or null if the profile doesn't exist).
 *
 * NOTE: this is the *optimistic* path — it writes locally and queues.
 * For fields with server-side constraints (e.g. booking_slug uniqueness),
 * use `updateProfileSlug` instead, which does an authoritative Supabase write
 * and surfaces duplicate-key errors.
 */
export async function updateProfileFields(
  userId: string,
  fields: Partial<Profile>,
): Promise<Profile | null> {
  const n = now();
  // Convert undefined → null so JSON.stringify preserves them as NULL in Supabase
  // (JSON.stringify strips undefined, which means sync would never clear a field)
  const cleanFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    cleanFields[k] = v === undefined ? null : v;
  }

  const update = { ...fields, updated_at: n, _sync_status: 'pending' } as Partial<Profile>;
  await db.profiles.update(userId, update);
  await db.sync_queue.add({
    operation: 'update',
    table_name: 'profiles',
    record_id: userId,
    payload: { ...cleanFields, updated_at: n },
    created_at: n,
    retry_count: 0,
  });
  return (await db.profiles.get(userId)) ?? null;
}

/**
 * Authoritatively update the booking slug via a direct Supabase write.
 * The queue path swallows errors to _sync_status='error' and never tells the
 * UI, so it can't be relied on for the unique constraint. This function:
 *   1. Writes directly to Supabase (anon key + RLS: own row only)
 *   2. On success → updates local Dexie with _sync_status: 'synced'
 *   3. On duplicate-key error → returns { ok: false, error: 'taken' }
 *
 * Pass `null` to clear the slug (writes SQL NULL, not empty string — the
 * unique index is partial WHERE booking_slug IS NOT NULL).
 */
export async function updateProfileSlug(
  userId: string,
  slug: string | null,
): Promise<{ ok: boolean; error?: 'taken' | 'network'; profile?: Profile | null }> {
  // Lazy import to avoid circular dependency at module load time
  const { supabase } = await import('./supabase');
  const n = now();

  const { error } = await supabase
    .from('profiles')
    .update({ booking_slug: slug, updated_at: n })
    .eq('id', userId);

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('constraint')) {
      return { ok: false, error: 'taken' };
    }
    return { ok: false, error: 'network' };
  }

  // Success — update local Dexie (no queue needed; Supabase is already updated)
  const localUpdate: Partial<Profile> = {
    booking_slug: slug ?? undefined,
    updated_at: n,
    _sync_status: 'synced',
  };
  await db.profiles.update(userId, localUpdate);
  const profile = await db.profiles.get(userId);
  return { ok: true, profile };
}
