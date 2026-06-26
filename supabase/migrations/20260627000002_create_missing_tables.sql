-- Create missing tables that exist in Dexie but were never created in Supabase
-- These are needed before the Wave 2 migration can ALTER them

-- === custom_items (Dexie v2, never had a Supabase migration) ===
CREATE TABLE IF NOT EXISTS custom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description text NOT NULL,
  detail text,
  amount numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_public boolean DEFAULT false,
  duration_minutes int DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  _sync_status text NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_custom_items_user ON custom_items(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_items_sort ON custom_items(user_id, sort_order);

ALTER TABLE custom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_items_owner ON custom_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- === material_items (Dexie v2, never had a Supabase migration) ===
CREATE TABLE IF NOT EXISTS material_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  markup_pct numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  _sync_status text NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_material_items_job ON material_items(job_id);
CREATE INDEX IF NOT EXISTS idx_material_items_user ON material_items(user_id);

ALTER TABLE material_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_items_owner ON material_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = material_items.job_id AND jobs.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = material_items.job_id AND jobs.user_id = auth.uid())
  );
