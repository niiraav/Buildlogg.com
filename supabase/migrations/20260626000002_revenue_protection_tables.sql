-- P2-01: Quote Follow-Ups
CREATE TABLE IF NOT EXISTS quote_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  first_nudge_at timestamptz NOT NULL,
  last_nudge_at timestamptz,
  nudge_count int NOT NULL DEFAULT 0,
  snooze_until timestamptz,
  snooze_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  _sync_status text NOT NULL DEFAULT 'pending'
);
CREATE INDEX idx_quote_follow_ups_user ON quote_follow_ups(user_id);
CREATE INDEX idx_quote_follow_ups_job ON quote_follow_ups(job_id);
ALTER TABLE quote_follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_follow_ups_owner ON quote_follow_ups USING (auth.uid() = user_id);

-- P2-02: Recurring Jobs
CREATE TABLE IF NOT EXISTS recurring_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  original_job_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  title text NOT NULL,
  address text,
  interval text NOT NULL,
  next_due_at timestamptz NOT NULL,
  reminder_lead_days int NOT NULL DEFAULT 14,
  status text NOT NULL DEFAULT 'active',
  last_completed_at timestamptz,
  contact_attempts int NOT NULL DEFAULT 0,
  suggested_month int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  _sync_status text NOT NULL DEFAULT 'pending'
);
CREATE INDEX idx_recurring_jobs_user ON recurring_jobs(user_id);
CREATE INDEX idx_recurring_jobs_customer ON recurring_jobs(customer_id);
CREATE INDEX idx_recurring_jobs_status ON recurring_jobs(status);
ALTER TABLE recurring_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_jobs_owner ON recurring_jobs USING (auth.uid() = user_id);

-- P2-03: Payment Chases
CREATE TABLE IF NOT EXISTS payment_chases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  user_id uuid NOT NULL,
  stage text NOT NULL,
  due_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  pause_reason text,
  message_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  _sync_status text NOT NULL DEFAULT 'pending'
);
CREATE INDEX idx_payment_chases_user ON payment_chases(user_id);
CREATE INDEX idx_payment_chases_job ON payment_chases(job_id);
CREATE INDEX idx_payment_chases_status ON payment_chases(status);
ALTER TABLE payment_chases ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_chases_owner ON payment_chases USING (auth.uid() = user_id);
