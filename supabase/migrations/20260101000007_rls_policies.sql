-- Consolidated RLS policies for all tables
-- (each table also has its own policy in the migration where it is created)

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles: own row" ON profiles;
CREATE POLICY "profiles: own row" ON profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers: own records" ON customers;
CREATE POLICY "customers: own records" ON customers
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs: own records" ON jobs;
CREATE POLICY "jobs: own records" ON jobs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- line_items
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "line_items: own via job" ON line_items;
CREATE POLICY "line_items: own via job" ON line_items
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = line_items.job_id AND jobs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = line_items.job_id AND jobs.user_id = auth.uid()
  ));

-- work_log (append-only, read-only via RLS)
ALTER TABLE work_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_log: own via job" ON work_log;
CREATE POLICY "work_log: own via job" ON work_log
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = work_log.job_id AND jobs.user_id = auth.uid()
  ));

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments: own via job" ON payments;
CREATE POLICY "payments: own via job" ON payments
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = payments.job_id AND jobs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = payments.job_id AND jobs.user_id = auth.uid()
  ));

-- job_photos
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_photos: own via job" ON job_photos;
CREATE POLICY "job_photos: own via job" ON job_photos
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_photos.job_id AND jobs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_photos.job_id AND jobs.user_id = auth.uid()
  ));
