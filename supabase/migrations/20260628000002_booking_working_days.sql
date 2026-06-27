-- Booking page: working days, hours, and blocked dates
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS booking_working_days int[] DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS booking_hours_start text DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS booking_hours_end text DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS booking_blocked_dates text[] DEFAULT '{}';
