-- Booking slug availability check RPC
-- RLS only lets users read their own profiles row, so a client cannot see
-- whether a slug is taken by another merchant. This SECURITY DEFINER function
-- returns a boolean only (no data leakage) and is safe to expose to anon/authenticated.
create or replace function is_booking_slug_taken(p_slug text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from profiles where booking_slug = p_slug);
$$;

grant execute on function is_booking_slug_taken(text) to anon, authenticated;
