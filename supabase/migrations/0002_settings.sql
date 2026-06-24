-- Xantle — schema v2: push tokens + account deletion, for the Settings screen (D3).
-- Draft for Victor's review before merge — adds a new table + a SECURITY DEFINER RPC,
-- same pattern as 0001_init.sql's room RPCs.

-- ── push_tokens (Expo push tokens) ───────────────────────────────────────────
-- Kept out of `profiles` on purpose: that table's "profiles read" policy is
-- `using (true)` (any authenticated user can read any profile), which would
-- leak every user's push token. This table is self-access only.
create table if not exists public.push_tokens (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  token       text,
  updated_at  timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "push tokens self read" on public.push_tokens;
create policy "push tokens self read" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push tokens self insert" on public.push_tokens;
create policy "push tokens self insert" on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push tokens self update" on public.push_tokens;
create policy "push tokens self update" on public.push_tokens
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "push tokens self delete" on public.push_tokens;
create policy "push tokens self delete" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- ── delete_account (Settings → Close account) ────────────────────────────────
-- auth.users delete cascades through profiles -> push_tokens / room_players /
-- subscriptions via existing FKs, so this is the single entry point.
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
grant execute on function public.delete_account() to authenticated;
