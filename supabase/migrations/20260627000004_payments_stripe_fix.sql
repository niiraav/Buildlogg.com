-- Fix payments table for Stripe card payments + terminal payments
-- Three issues fixed:
-- 1. CHECK constraint on 'method' excluded 'card' (webhook) and 'terminal' (app UI)
--    — both silently failed to INSERT
-- 2. No _sync_status column — webhook INSERT included _sync_status which caused
--    a column-not-found error; also initialSync's safeBulkPut expects it
-- 3. Both errors were caught silently, so Stripe payments were never recorded

-- Add _sync_status column (DEFAULT 'synced' is correct for server-side inserts
-- and for existing rows; initialSync overrides to 'synced' on pull)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS _sync_status text NOT NULL DEFAULT 'synced';

-- Drop the old CHECK constraint and add a new one with 'card' and 'terminal'
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'bank_transfer', 'terminal', 'card', 'other'));
