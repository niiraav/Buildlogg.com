-- Add stripe_customer_id to profiles for subscription management
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
