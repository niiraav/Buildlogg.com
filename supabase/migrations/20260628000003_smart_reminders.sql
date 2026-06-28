-- W3-1: Smart Reminders — recurring_jobs + profiles + reminder_log + template constraint

-- 1. Add reminder fields to recurring_jobs
ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS reminder_mode text DEFAULT 'remind_me',
  ADD COLUMN IF NOT EXISTS reminder_channel text,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_status text,
  ADD COLUMN IF NOT EXISTS reminder_count int DEFAULT 0;

-- 2. Add reminder defaults + push subscription to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS default_reminder_mode text DEFAULT 'remind_me',
  ADD COLUMN IF NOT EXISTS default_reminder_channel text,
  ADD COLUMN IF NOT EXISTS push_subscription_endpoint text,
  ADD COLUMN IF NOT EXISTS push_subscription_keys jsonb;

-- 3. Create reminder_log table
CREATE TABLE IF NOT EXISTS reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_job_id uuid REFERENCES recurring_jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  channel text NOT NULL,
  recipient text,
  status text NOT NULL,
  message_preview text,
  provider_id text,
  error_message text,
  sent_at timestamptz DEFAULT now(),
  _sync_status text DEFAULT 'synced'
);

-- 4. RLS policy for reminder_log
DROP POLICY IF EXISTS "reminder_log_owner" ON reminder_log;
CREATE POLICY reminder_log_owner ON reminder_log
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. Update message_templates CHECK constraint to include 'recurring_reminder'
ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_category_check;
ALTER TABLE message_templates ADD CONSTRAINT message_templates_category_check
  CHECK (category IN ('booking', 'reminder', 'invoice', 'follow_up', 'review', 'receipt', 'update', 'custom', 'recurring_reminder'));
