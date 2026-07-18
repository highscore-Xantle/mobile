-- Xantle — friend codes. Adding a friend is now code-based: everyone has a
-- short shareable code; you paste someone's to send them a request. The
-- accept step stays silent to the SENDER (no "X accepted/declined"
-- notification) — an accepted request simply appears in your friends list,
-- and a request that's never accepted (e.g. sent to a bot from the post-match
-- button) just never appears, so bots stay non-obvious.

alter table public.profiles add column if not exists friend_code text unique;

-- Returns my friend code, generating + persisting one the first time.
create or replace function public.my_friend_code()
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing text; code text;
begin
  if me is null then raise exception 'auth required'; end if;
  select friend_code into existing from public.profiles where id = me;
  if existing is not null then return existing; end if;
  loop
    code := upper(substring(md5(random()::text) for 6));  -- 6-char code
    begin
      update public.profiles set friend_code = code where id = me;
      exit;  -- success
    exception when unique_violation then
      -- extremely rare collision — pick another and retry
    end;
  end loop;
  return code;
end $$;
grant execute on function public.my_friend_code() to authenticated;

-- Send a friend request to the owner of a code. Reuses send_friend_request's
-- guards (self/block/dup/cap + reciprocal auto-accept). auth.uid() is
-- unchanged inside a SECURITY DEFINER call, so the guards apply to the caller.
create or replace function public.add_friend_by_code(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'auth required'; end if;
  select id into target from public.profiles where friend_code = upper(trim(p_code));
  if target is null then raise exception 'No player has that code.'; end if;
  if target = me then raise exception 'That is your own code.'; end if;
  perform public.send_friend_request(target);
end $$;
grant execute on function public.add_friend_by_code(text) to authenticated;
