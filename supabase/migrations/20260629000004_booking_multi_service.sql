-- Multi-service booking: store per-service breakdown and combined duration
-- booking_requests writes happen via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
-- reads use existing booking_requests_owner_select policy
-- No RLS changes needed.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS service_items jsonb,
  ADD COLUMN IF NOT EXISTS total_duration int DEFAULT 60;
