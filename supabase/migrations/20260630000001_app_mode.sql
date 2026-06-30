-- Add app_mode column to profiles
-- Drives feature visibility in onboarding and app (quotes vs bookings vs both)
-- Existing users: derive app_mode from business_type
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_mode TEXT DEFAULT 'quotes';

-- Set existing beauty users to bookings mode
UPDATE profiles SET app_mode = 'bookings' WHERE business_type = 'beauty' AND app_mode IS NULL;

-- Set all other existing users to quotes mode
UPDATE profiles SET app_mode = 'quotes' WHERE business_type != 'beauty' AND app_mode IS NULL;
