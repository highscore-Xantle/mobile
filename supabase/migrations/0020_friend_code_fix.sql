-- Xantle — fix my_friend_code (0019) returning a code that was never stored.
--
-- Bug 1: `update profiles set friend_code=code where id=me` affecting 0 rows
-- raises no error, so the loop exits and returns a phantom code that exists
-- nowhere — every subsequent call regenerates a DIFFERENT phantom code, so
-- nobody can ever add the user and the modal always shows a plausible code.
-- Bug 2: two concurrent first-calls both see NULL and both update → the code
-- shown/copied on the first device is silently overwritten.
--
-- Fix: only claim the code when it's still null (so a concurrent winner isn't
-- clobbered), and if 0 rows were affected, read back the persisted value;
-- raise if there's genuinely no profile row instead of returning a lie.
create or replace function public.my_friend_code()
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing text; code text; updated int;
begin
  if me is null then raise exception 'auth required'; end if;
  select friend_code into existing from public.profiles where id = me;
  if existing is not null then return existing; end if;
  loop
    code := upper(substring(md5(random()::text) for 6));
    begin
      update public.profiles set friend_code = code
       where id = me and friend_code is null;
      get diagnostics updated = row_count;
      if updated > 0 then
        return code;                       -- we claimed it
      end if;
      -- 0 rows: either no profile row, or someone else set it first.
      select friend_code into existing from public.profiles where id = me;
      if existing is not null then return existing; end if;   -- concurrent winner
      raise exception 'no profile for this account';          -- genuinely missing
    exception when unique_violation then
      -- code collided with another user — pick a new one and retry
    end;
  end loop;
end $$;
grant execute on function public.my_friend_code() to authenticated;
