-- Xantle — profile avatar. The user's chosen photo (a Cloudinary URL) or the
-- image carried over from their Google sign-in. Null means "show initials".
-- Set during the post-onboarding photo step (src/app/onboarding-photo.tsx).
alter table public.profiles
  add column if not exists avatar_url text;
