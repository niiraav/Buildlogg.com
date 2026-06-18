import { db } from './db';

export async function addToSyncQueue(
  table: string,
  id: string,
  payload: Record<string, unknown>,
  operation: 'insert' | 'update' | 'delete' = 'update'
) {
  await db.sync_queue.add({
    operation,
    table_name: table,
    record_id: id,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  });
}
