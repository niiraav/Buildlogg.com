-- profiles: one row per authenticated user, created on first sign-in
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  phone           text NOT NULL,
  business_name   text,                          -- nullable: optional at onboarding
  trade           text CHECK (trade IN (
                    'plumber', 'electrician',
                    'builder', 'other'
                  )),
  callout_charge  numeric(10,2) NOT NULL DEFAULT 75.00,
  payment_terms   text NOT NULL DEFAULT 'on_completion'
                  CHECK (payment_terms IN (
                    'on_completion', 'deposit', 'invoice'
                  )),
  default_labour_description text NOT NULL DEFAULT 'Labour',
  default_labour_charge  numeric(10,2) NOT NULL DEFAULT 0.00,
  quote_valid_days integer NOT NULL DEFAULT 30,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only read/write their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: own row" ON profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
