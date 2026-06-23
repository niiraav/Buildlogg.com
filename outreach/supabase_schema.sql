-- ─────────────────────────────────────────────────────
-- Buildlogg Cold Email — Supabase Schema
-- Run this in Supabase SQL Editor
-- Safe to re-run — drops and recreates all tables
-- ─────────────────────────────────────────────────────

-- Clean up any partial tables from previous failed runs
DROP VIEW IF EXISTS cold_email_stats;
DROP TABLE IF EXISTS cold_email_sends;
DROP TABLE IF EXISTS cold_email_state;
DROP TABLE IF EXISTS email_suppressions;

-- 1. Suppression list — emails that should never receive outreach
CREATE TABLE email_suppressions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  reason        TEXT DEFAULT 'manual',
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Per-lead sequence state
CREATE TABLE cold_email_state (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  lead_name           TEXT,
  lead_company        TEXT,
  subcategory         TEXT,
  score               INT,
  sequence_step       INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'new',
  last_sent_at        TIMESTAMPTZ,
  provider_message_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Send log — one row per email actually sent
CREATE TABLE cold_email_sends (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_email          TEXT NOT NULL,
  sequence_step       INT NOT NULL,
  subject             TEXT,
  provider_message_id TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              TEXT DEFAULT 'sent',
  error_message       TEXT
);

-- 4. Indexes
CREATE INDEX idx_email_suppressions_email
  ON email_suppressions (LOWER(email));

CREATE INDEX idx_cold_email_state_email
  ON cold_email_state (LOWER(email));
CREATE INDEX idx_cold_email_state_step_status
  ON cold_email_state (sequence_step, status);

CREATE INDEX idx_cold_email_sends_sent_at
  ON cold_email_sends (sent_at);
CREATE INDEX idx_cold_email_sends_email
  ON cold_email_sends (LOWER(lead_email));

-- 5. Enable RLS
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cold_email_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE cold_email_sends ENABLE ROW LEVEL SECURITY;

-- 6. Stats view
CREATE VIEW cold_email_stats AS
SELECT
  COUNT(DISTINCT email) AS total_leads,
  COUNT(DISTINCT CASE WHEN sequence_step >= 1 THEN email END) AS step1_sent,
  COUNT(DISTINCT CASE WHEN sequence_step >= 2 THEN email END) AS step2_sent,
  COUNT(DISTINCT CASE WHEN sequence_step >= 3 THEN email END) AS step3_sent,
  COUNT(DISTINCT CASE WHEN sequence_step >= 4 THEN email END) AS step4_sent,
  COUNT(DISTINCT CASE WHEN status = 'replied' THEN email END) AS replied,
  COUNT(DISTINCT CASE WHEN status = 'unsubscribed' THEN email END) AS unsubscribed,
  COUNT(DISTINCT CASE WHEN status = 'bounced' THEN email END) AS bounced
FROM cold_email_state;
