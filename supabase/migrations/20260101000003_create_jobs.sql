-- jobs: core entity, one row per job from Enquiry through terminal states
CREATE TABLE jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id         uuid NOT NULL REFERENCES customers(id),

  -- Identity
  title               text NOT NULL,
  job_number          text,                      -- auto-generated: J-1001, J-1002 etc.

  -- Status machine
  status              text NOT NULL DEFAULT 'enquiry'
                      CHECK (status IN (
                        'enquiry', 'quoted', 'booked', 'in_progress',
                        'awaiting_payment', 'paid', 'no_show',
                        'cancelled', 'written_off'
                      )),

  -- Scheduling
  scheduled_start     timestamptz,              -- nullable until Booked
  scheduled_end       timestamptz,              -- nullable; end of job window
  actual_start        timestamptz,              -- set when Dave taps "I'm here"
  actual_end          timestamptz,              -- set when Dave taps "Mark Done"

  -- Multi-day flag
  is_multi_day        boolean NOT NULL DEFAULT false,

  -- Quote / payment terms (set at quote creation, inherited by job)
  payment_terms       text NOT NULL DEFAULT 'on_completion'
                      CHECK (payment_terms IN (
                        'on_completion', 'deposit', 'invoice'
                      )),
  deposit_pct         integer CHECK (deposit_pct BETWEEN 0 AND 100),
                                                -- null unless payment_terms='deposit'
  -- Quote lifecycle
  quote_number        text,                     -- deprecated: job_number is the single canonical reference
  quote_sent_at       timestamptz,
  quote_send_method   text CHECK (quote_send_method IN ('whatsapp', 'sms', 'copy')),
  quote_expires_at    timestamptz,              -- quote_sent_at + quote_valid_days

  -- Invoice lifecycle
  invoice_number      text,                     -- e.g. INV-1001; generated at Awaiting Payment
  invoice_sent_at     timestamptz,

  -- Cancellation / no-show
  cancellation_reason text,                     -- 'customer_cancelled' | 'dave_cancelled'
  notes               text,                     -- free text notes field

  -- Timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_user_id   ON jobs(user_id);
CREATE INDEX idx_jobs_status    ON jobs(user_id, status);
CREATE INDEX idx_jobs_scheduled ON jobs(user_id, scheduled_start);

-- RLS: users can only read/write their own jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs: own records" ON jobs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
