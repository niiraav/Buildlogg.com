-- Make the exec_sql RPC dependency explicit and reproducible.
-- Cron endpoints use this for complex JOINs (quote_follow_ups / payment_chases
-- lack FK constraints to jobs/customers, so PostgREST embedded resources don't work).
-- If already created manually in dashboard, CREATE OR REPLACE is a safe no-op.

CREATE OR REPLACE FUNCTION exec_sql(query text, params json DEFAULT '[]'::json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  p1 text := params->>0;
  p2 text := params->>1;
  p3 text := params->>2;
  p4 text := params->>3;
  p5 text := params->>4;
BEGIN
  EXECUTE query
    USING p1, p2, p3, p4, p5
    INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION exec_sql(text, json) TO authenticated, anon, service_role;
