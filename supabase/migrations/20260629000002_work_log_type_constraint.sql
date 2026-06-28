-- Fix: work_log CHECK constraint only allowed 5 original types.
-- The TS WorkLogType union has 21 types. All cron and sync inserts with new types
-- were silently failing (supabaseInsert is fire-and-forget).
-- This also fixes the pre-existing recurring cron silent failure.

ALTER TABLE work_log DROP CONSTRAINT IF EXISTS work_log_type_check;
ALTER TABLE work_log ADD CONSTRAINT work_log_type_check CHECK (type IN (
  'note', 'charge', 'status_change', 'customer_notified', 'running_late',
  'quote_sent', 'expense',
  'quote_follow_up_sent', 'quote_follow_up_snoozed', 'quote_follow_up_responded',
  'recurring_reminder_sent', 'recurring_reminder_no_response',
  'payment_chase_sent', 'payment_chase_paused', 'payment_chase_resumed',
  'recurring_job_created', 'recurring_job_cancelled',
  'auto_reminder_sent', 'auto_reminder_failed', 'auto_reminder_bounced', 'recurring_dormant_auto'
));
