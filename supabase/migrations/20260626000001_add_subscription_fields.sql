-- Add subscription fields to profiles for entitlements/Pro tier
-- These are optional fields — existing records work fine without them

ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz DEFAULT NULL;

-- subscription_status values: 'active' | 'trialing' | 'expired' | 'canceled' | null
-- null = beta user (treated as Pro during beta, free after launch unless set)
-- subscription_ends_at = trial end date or cancellation effective date
