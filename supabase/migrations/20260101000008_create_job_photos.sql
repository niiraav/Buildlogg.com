-- job_photos: photos attached to jobs, stored as base64 data URLs
CREATE TABLE job_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_url    text NOT NULL,
  caption     text,
  taken_at    timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_photos_job_id ON job_photos(job_id);

-- RLS: users can only access photos via their own jobs
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_photos: own via job" ON job_photos
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_photos.job_id AND jobs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_photos.job_id AND jobs.user_id = auth.uid()
  ));
