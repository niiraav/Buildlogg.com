-- Booking page: lunch breaks + per-day working hours
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS booking_break_start text,
  ADD COLUMN IF NOT EXISTS booking_break_end text,
  ADD COLUMN IF NOT EXISTS booking_hours_per_day jsonb;
