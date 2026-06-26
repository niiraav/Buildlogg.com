-- Wave 2: Booking Funnel — profile fields, custom_items columns, booking_requests, checkout_sessions

-- === Profile additions ===
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS booking_slug text,
  ADD COLUMN IF NOT EXISTS booking_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_buffer_hours int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS booking_show_phone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connected boolean DEFAULT false;

-- Unique constraint on booking_slug (only where set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_booking_slug
  ON profiles(booking_slug) WHERE booking_slug IS NOT NULL;

-- === CustomItem additions ===
ALTER TABLE custom_items
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_minutes int DEFAULT 60;

-- === booking_requests table ===
CREATE TABLE IF NOT EXISTS booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_description text NOT NULL,
  service_amount numeric NOT NULL DEFAULT 0,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  client_email text,
  requested_date date NOT NULL,
  requested_time text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  referral_source text,
  referral_detail text,
  stripe_checkout_session_id text,
  deposit_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  accepted_job_id uuid
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_merchant ON booking_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_phone ON booking_requests(client_phone, merchant_id, created_at);

ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
-- Merchant can read their own requests
CREATE POLICY booking_requests_owner_select ON booking_requests
  FOR SELECT USING (merchant_id = auth.uid());
-- Merchant can update (accept/reject) their own requests
CREATE POLICY booking_requests_owner_update ON booking_requests
  FOR UPDATE USING (merchant_id = auth.uid());
-- NO INSERT policy — only the server-side Function inserts using service role key

-- === checkout_sessions table (Stripe) ===
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid,
  booking_request_id uuid,
  stripe_session_id text NOT NULL,
  stripe_url text NOT NULL,
  amount numeric NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'deposit',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_merchant ON checkout_sessions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_stripe ON checkout_sessions(stripe_session_id);

ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkout_sessions_owner ON checkout_sessions
  FOR SELECT USING (merchant_id = auth.uid());
-- NO INSERT/UPDATE policy — server-side Functions handle these with service role key

-- === Job additions for referral tracking ===
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS referral_detail text;
