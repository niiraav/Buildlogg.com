-- ─────────────────────────────────────────────────────
-- Buildlogg — In-App Feedback Table
-- Run this in Supabase SQL Editor
-- Safe to re-run — drops and recreates the table
-- ─────────────────────────────────────────────────────

DROP TABLE IF EXISTS feedback;

CREATE TABLE feedback (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'general'
                CHECK (type IN ('bug', 'feature_request', 'general')),
  message     TEXT NOT NULL,
  user_email  TEXT,
  status      TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'reviewed', 'resolved', 'ignored')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for dashboard triage (sort by status / created_at)
CREATE INDEX idx_feedback_status_created
  ON feedback (status, created_at DESC);

-- Index for per-user lookups (if we add history later)
CREATE INDEX idx_feedback_user_id
  ON feedback (user_id);

-- Enable RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can INSERT their own feedback only (one-way communication — no SELECT)
DROP POLICY IF EXISTS "feedback: insert own" ON feedback;
CREATE POLICY "feedback: insert own" ON feedback
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
