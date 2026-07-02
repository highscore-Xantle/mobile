-- Xantle — schema v5: social wins feed (posts, likes, comments).
-- Follows the same conventions as 0001_init.sql / 0003_games.sql:
--   • All tables are READ-ONLY via RLS for clients.
--   • All writes go through SECURITY DEFINER RPCs so we keep a single
--     place to enforce business rules without losing RLS protection.
--
-- Apply via Supabase SQL editor or `supabase db push`.

-- ── posts ──────────────────────────────────────────────────────────────────
-- A post represents a completed game result that a player chose to share.
-- match_id is nullable — it references a finished game (games.id from
-- 0003_games.sql) or room (rooms.id from 0001_init.sql).
-- game_type is a denormalised label ('number-duel', 'pixel-rush', etc.)
-- stored alongside the reference so the card can display the badge without
-- a second join.
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  game_type   text not null,
  match_id    uuid,                              -- fk resolved at app level
  result_text text not null,                     -- e.g. "Won 5–2 vs @samuel"
  media_url   text,                              -- optional image / score graphic
  created_at  timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx    on public.posts (user_id);

-- ── post_likes ─────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

-- ── post_comments ──────────────────────────────────────────────────────────
-- parent_id null → top-level comment.
-- parent_id set  → reply (one level allowed; client enforces depth = 1).
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id)    on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.post_comments(id)    on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx    on public.post_comments (post_id, created_at asc);
create index if not exists post_comments_parent_idx  on public.post_comments (parent_id);

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- share_win: create a post after a game finishes.
-- Called by the app once a match concludes and the user taps "Share".
create or replace function public.share_win(
  p_game_type   text,
  p_result_text text,
  p_match_id    uuid    default null,
  p_media_url   text    default null
)
returns public.posts language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p  public.posts;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if trim(p_result_text) = '' then raise exception 'result_text cannot be blank'; end if;
  insert into public.posts (user_id, game_type, match_id, result_text, media_url)
       values (me, p_game_type, p_match_id, trim(p_result_text), nullif(trim(coalesce(p_media_url,'')), ''))
    returning * into p;
  return p;
end $$;
grant execute on function public.share_win(text, text, uuid, text) to authenticated;

-- toggle_like: idempotent like/unlike for a post.
-- Returns the new like count and whether the caller now likes the post.
create or replace function public.toggle_like(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me       uuid := auth.uid();
  liked    boolean;
  cnt      bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'post not found';
  end if;

  if exists (select 1 from public.post_likes where post_id = p_post_id and user_id = me) then
    delete from public.post_likes where post_id = p_post_id and user_id = me;
    liked := false;
  else
    insert into public.post_likes (post_id, user_id) values (p_post_id, me)
    on conflict do nothing;
    liked := true;
  end if;

  select count(*) into cnt from public.post_likes where post_id = p_post_id;
  return jsonb_build_object('liked', liked, 'like_count', cnt);
end $$;
grant execute on function public.toggle_like(uuid) to authenticated;

-- add_comment: add a top-level comment or a reply (parent_id must belong to same post).
create or replace function public.add_comment(
  p_post_id   uuid,
  p_body      text,
  p_parent_id uuid default null
)
returns public.post_comments language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c  public.post_comments;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if trim(p_body) = '' then raise exception 'body cannot be blank'; end if;
  if not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'post not found';
  end if;
  -- Enforce one level of nesting: parent must be a root comment on the same post.
  if p_parent_id is not null then
    if not exists (
      select 1 from public.post_comments
       where id = p_parent_id and post_id = p_post_id and parent_id is null
    ) then
      raise exception 'parent_id must reference a root comment on the same post';
    end if;
  end if;

  insert into public.post_comments (post_id, user_id, parent_id, body)
       values (p_post_id, me, p_parent_id, trim(p_body))
    returning * into c;
  return c;
end $$;
grant execute on function public.add_comment(uuid, text, uuid) to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;

-- Posts: any authenticated user can read; no direct client writes.
drop policy if exists "posts read"     on public.posts;
create policy "posts read"     on public.posts for select     to authenticated using (true);
drop policy if exists "posts no write" on public.posts;
create policy "posts no write" on public.posts for insert     to authenticated with check (false);

-- Likes: any authenticated user can read; no direct client writes.
drop policy if exists "likes read"     on public.post_likes;
create policy "likes read"     on public.post_likes for select to authenticated using (true);
drop policy if exists "likes no write" on public.post_likes;
create policy "likes no write" on public.post_likes for insert to authenticated with check (false);

-- Comments: any authenticated user can read; no direct client writes.
drop policy if exists "comments read"     on public.post_comments;
create policy "comments read"     on public.post_comments for select to authenticated using (true);
drop policy if exists "comments no write" on public.post_comments;
create policy "comments no write" on public.post_comments for insert to authenticated with check (false);

-- ── Realtime ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='posts') then
    alter publication supabase_realtime add table public.posts;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='post_likes') then
    alter publication supabase_realtime add table public.post_likes;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='post_comments') then
    alter publication supabase_realtime add table public.post_comments;
  end if;
end $$;
