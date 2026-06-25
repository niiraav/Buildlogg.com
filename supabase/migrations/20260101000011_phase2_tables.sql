-- Phase 2 tables — message_templates + generated_documents
-- Run this in the Buildlogg Supabase SQL Editor (project: klprbojgvpdnjvxvmylh)

-- message_templates: customisable WhatsApp/SMS templates with placeholders
CREATE TABLE IF NOT EXISTS message_templates (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'custom'
              CHECK (category IN ('booking', 'reminder', 'invoice', 'follow_up', 'review', 'custom')),
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_user_id ON message_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_user_sort ON message_templates(user_id, sort_order);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_templates: own records" ON message_templates
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- generated_documents: PDF quotes and invoices generated client-side
CREATE TABLE IF NOT EXISTS generated_documents (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'quote'
              CHECK (type IN ('quote', 'invoice')),
  version     INTEGER NOT NULL DEFAULT 1,
  blob_key    TEXT,
  file_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_user_id ON generated_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_job_id ON generated_documents(job_id);

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generated_documents: own records" ON generated_documents
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add Phase 2 columns to profiles (additive — safe if columns already exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'trades';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_data_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_sort_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_business_url TEXT;

-- Add Phase 2 columns to customers (additive)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS merged_into TEXT;

-- Add Phase 2 columns to jobs (additive)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_status TEXT DEFAULT 'none';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_stripe_link_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_stripe_url TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_requested_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_policy_hours INTEGER DEFAULT 24;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
