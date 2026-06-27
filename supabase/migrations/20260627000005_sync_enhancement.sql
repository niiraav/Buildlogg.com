-- W3-2: Multi-Device Cloud Sync Enhancement
-- 1. Add _sync_status to tables missing it (needed by safeBulkPut in initialSync)
-- 2. Add updated_at to payments (fixes pre-existing bug: handleChangePaymentMethod
--    sends updated_at in sync payload but column doesn't exist → push silently fails)
-- 3. Enable realtime (Postgres changes) for key tables

-- === _sync_status column for tables missing it ===
ALTER TABLE customers ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';
ALTER TABLE work_log ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';

-- === updated_at for payments (pre-existing sync bug fix) ===
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === Enable realtime for key tables ===
-- supabase_realtime is the default publication name in Supabase projects.
-- Adding tables to it enables Postgres Changes events for realtime subscriptions.
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE line_items;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE work_log;
ALTER PUBLICATION supabase_realtime ADD TABLE booking_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE custom_items;
ALTER PUBLICATION supabase_realtime ADD TABLE message_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE job_photos;
