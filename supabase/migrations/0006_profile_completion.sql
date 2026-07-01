-- Xantle — schema v6: profile completion fields.
-- Adds avatar_url and country to profiles so the app can enforce
-- a complete profile during onboarding.
--
-- No new tables, no new RLS policies required: the existing
-- "profiles self update" policy (using (id = auth.uid())) already
-- allows authenticated users to update their own row, which now
-- includes these two new columns.
--
-- Apply via Supabase SQL editor or `supabase db push`.

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists country    text;
