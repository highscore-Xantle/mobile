-- Xantle — profile street address, captured alongside region (state) and
-- country during onboarding (auto from GPS reverse-geocode, or entered
-- manually). Nullable — street data isn't always available.
alter table public.profiles
  add column if not exists address text;
