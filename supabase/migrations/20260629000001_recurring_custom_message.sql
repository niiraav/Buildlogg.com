-- Sprint 3: Add custom_reminder_message column to recurring_jobs
ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS custom_reminder_message text;
