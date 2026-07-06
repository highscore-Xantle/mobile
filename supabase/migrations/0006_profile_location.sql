-- Xantle — profile location: city/region/country captured at onboarding
-- (auto-detected via device GPS + reverse geocoding, or entered manually).
-- lat/lon are only populated by the on-device GPS path (null on manual entry)
-- and are kept alongside the human-readable fields for future proximity
-- matching (e.g. `earthdistance`/`cube` or PostGIS) without another migration.

alter table public.profiles
  add column if not exists city      text,
  add column if not exists region    text,
  add column if not exists country   text,
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;
