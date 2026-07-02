-- =====================================================================
-- PixelTown (Gather Town Clone) ??Supabase ?꾩껜 ?ㅽ궎留?-- Supabase Dashboard > SQL Editor ???꾩껜瑜?遺숈뿬?ｊ퀬 ?ㅽ뻾?섏꽭??
-- ?щ윭 踰??ㅽ뻾?대룄 ?덉쟾?⑸땲??(idempotent).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- profiles: ?좎? ?꾨줈??+ 罹먮┃???명삎 + ?곹깭
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text unique,
  display_name   text not null default 'Player',
  skin           text not null default '#f1c27d',
  color          text not null default '#6c8cff',   -- ?곸쓽
  pants          text not null default '#1f2937',   -- ?섏쓽
  hair           text not null default 'short',
  hair_color     text not null default '#4b3621',
  hat            text not null default 'none',
  face           text not null default 'smile',
  status         text not null default 'available', -- available | busy | dnd
  status_message text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 湲곗〈 諛고룷 ?낃렇?덉씠?쒖슜
alter table public.profiles add column if not exists pants text not null default '#1f2937';
alter table public.profiles add column if not exists hair text not null default 'short';
alter table public.profiles add column if not exists hair_color text not null default '#4b3621';
alter table public.profiles add column if not exists status text not null default 'available';
alter table public.profiles add column if not exists status_message text;
-- avatar v2 (top style / shoes / facial hair / glasses / special costume)
alter table public.profiles add column if not exists top_style text not null default 'tshirt';
alter table public.profiles add column if not exists shoes text not null default '#292524';
alter table public.profiles add column if not exists facial_hair text not null default 'none';
alter table public.profiles add column if not exists glasses text not null default 'none';
alter table public.profiles add column if not exists special text not null default 'none';

alter table public.profiles enable row level security;

drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- spaces: 媛??怨듦컙 (怨좎쑀 URL slug 蹂댁쑀)
-- ---------------------------------------------------------------
create table if not exists public.spaces (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  description     text,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  is_public       boolean not null default true,
  has_password    boolean not null default false,
  require_login   boolean not null default false,
  allowed_domains text[],           -- ?대찓???꾨찓???쒗븳 (null = ?쒗븳 ?놁쓬)
  guest_checkin   boolean not null default false,
  created_at      timestamptz not null default now()
);

-- 鍮꾨?踰덊샇 ?댁떆??蹂꾨룄 ?뚯씠釉?(RLS濡??꾩쟾 李⑤떒, RPC濡쒕쭔 ?묎렐)
create table if not exists public.space_secrets (
  space_id      uuid primary key references public.spaces(id) on delete cascade,
  password_hash text not null
);
alter table public.space_secrets enable row level security;
-- (?뺤콉 ?놁쓬 = ?꾨Т??吏곸젒 ?묎렐 遺덇?; security definer ?⑥닔留??ъ슜)

-- ---------------------------------------------------------------
-- space_members: ??븷 (admin / moderator / mapmaker / member)
-- ---------------------------------------------------------------
create table if not exists public.space_members (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member'
             check (role in ('admin','moderator','mapmaker','member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- RLS ?ш?瑜??쇳븯湲??꾪븳 helper (security definer)
create or replace function public.is_space_member(p_space uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space and user_id = p_user
  );
$$;

create or replace function public.space_role(p_space uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.space_members
  where space_id = p_space and user_id = p_user;
$$;

create or replace function public.is_space_admin(p_space uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.spaces where id = p_space and owner_id = p_user
  ) or coalesce(public.space_role(p_space, p_user) = 'admin', false);
$$;

create or replace function public.is_space_mod(p_space uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_space_admin(p_space, p_user)
    or coalesce(public.space_role(p_space, p_user) = 'moderator', false);
$$;

alter table public.spaces enable row level security;

drop policy if exists "spaces visible" on public.spaces;
create policy "spaces visible" on public.spaces for select
  using (is_public = true or owner_id = auth.uid() or public.is_space_member(id, auth.uid()));

drop policy if exists "users create spaces" on public.spaces;
create policy "users create spaces" on public.spaces for insert
  with check (auth.uid() = owner_id);

drop policy if exists "admins update spaces" on public.spaces;
create policy "admins update spaces" on public.spaces for update
  using (public.is_space_admin(id, auth.uid()));

drop policy if exists "owner deletes spaces" on public.spaces;
create policy "owner deletes spaces" on public.spaces for delete
  using (owner_id = auth.uid());

alter table public.space_members enable row level security;

drop policy if exists "members visible" on public.space_members;
create policy "members visible" on public.space_members for select
  using (user_id = auth.uid() or public.is_space_member(space_id, auth.uid())
         or public.is_space_admin(space_id, auth.uid()));

drop policy if exists "join or admin add" on public.space_members;
create policy "join or admin add" on public.space_members for insert
  with check (
    public.is_space_admin(space_id, auth.uid())
    or (
      user_id = auth.uid() and role = 'member'
      and exists (select 1 from public.spaces s where s.id = space_id and s.is_public)
    )
  );

drop policy if exists "admin change role" on public.space_members;
create policy "admin change role" on public.space_members for update
  using (public.is_space_admin(space_id, auth.uid()));

drop policy if exists "admin remove or leave" on public.space_members;
create policy "admin remove or leave" on public.space_members for delete
  using (user_id = auth.uid() or public.is_space_admin(space_id, auth.uid()));

-- ?ㅽ럹?댁뒪 ?앹꽦 ?? ?ㅻ꼫瑜?admin 硫ㅻ쾭濡?+ 湲곕낯 諛?3媛??앹꽦
create or replace function public.handle_new_space()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.space_members (space_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict do nothing;
  insert into public.rooms (space_id, name, template_key, sort_order) values
    (new.id, 'Main Plaza', 'plaza', 0),
    (new.id, 'Office', 'office', 1),
    (new.id, 'Garden', 'garden', 2),
    (new.id, 'Grand Prix Circuit', 'circuit', 3);
  return new;
end;
$$;

drop trigger if exists on_space_created on public.spaces;
create trigger on_space_created after insert on public.spaces
  for each row execute function public.handle_new_space();

-- 鍮꾨?踰덊샇 ?ㅼ젙/寃利?RPC
create or replace function public.set_space_password(p_space uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_space_admin(p_space, auth.uid()) then
    raise exception 'not allowed';
  end if;
  if p_password is null or length(p_password) = 0 then
    delete from public.space_secrets where space_id = p_space;
    update public.spaces set has_password = false where id = p_space;
  else
    insert into public.space_secrets (space_id, password_hash)
    values (p_space, extensions.crypt(p_password, extensions.gen_salt('bf')))
    on conflict (space_id) do update set password_hash = excluded.password_hash;
    update public.spaces set has_password = true where id = p_space;
  end if;
end;
$$;

create or replace function public.verify_space_password(p_space uuid, p_password text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.space_secrets
    where space_id = p_space and password_hash = extensions.crypt(p_password, password_hash)
  );
$$;

-- ---------------------------------------------------------------
-- space_bans: 諛?紐⑸줉 (?좎? id ?먮뒗 寃뚯뒪??key)
-- ---------------------------------------------------------------
create table if not exists public.space_bans (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  target_key text not null,          -- auth uid ?먮뒗 guest_xxx
  target_name text,
  reason     text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (space_id, target_key)
);
alter table public.space_bans enable row level security;

drop policy if exists "bans readable" on public.space_bans;
create policy "bans readable" on public.space_bans for select using (true);

drop policy if exists "mods ban" on public.space_bans;
create policy "mods ban" on public.space_bans for insert
  with check (public.is_space_mod(space_id, auth.uid()));

drop policy if exists "mods unban" on public.space_bans;
create policy "mods unban" on public.space_bans for delete
  using (public.is_space_mod(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- rooms: ?ㅽ럹?댁뒪 ?덉쓽 媛쒕퀎 留?-- ---------------------------------------------------------------
create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  name         text not null,
  template_key text not null default 'plaza',
  map_data     jsonb,               -- 留??먮뵒???섏젙蹂?(null = ?쒗뵆由?洹몃?濡?
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists rooms_space_idx on public.rooms(space_id);

alter table public.rooms enable row level security;

create or replace function public.space_visible(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space
      and (s.is_public or s.owner_id = auth.uid() or public.is_space_member(s.id, auth.uid()))
  );
$$;

drop policy if exists "rooms visible" on public.rooms;
create policy "rooms visible" on public.rooms for select
  using (public.space_visible(space_id));

create or replace function public.can_edit_map(p_space uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_space_admin(p_space, p_user)
    or coalesce(public.space_role(p_space, p_user) in ('mapmaker','moderator'), false);
$$;

drop policy if exists "mapmakers manage rooms" on public.rooms;
create policy "mapmakers manage rooms" on public.rooms for insert
  with check (public.can_edit_map(space_id, auth.uid()));

drop policy if exists "mapmakers update rooms" on public.rooms;
create policy "mapmakers update rooms" on public.rooms for update
  using (public.can_edit_map(space_id, auth.uid()));

drop policy if exists "admins delete rooms" on public.rooms;
create policy "admins delete rooms" on public.rooms for delete
  using (public.is_space_admin(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- desks: ?곗뒪??吏??(?ㅻ툕?앺듃 id 湲곗?)
-- ---------------------------------------------------------------
create table if not exists public.desks (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  object_id  text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default '',
  decor      jsonb,
  updated_at timestamptz not null default now(),
  unique (room_id, object_id)
);
alter table public.desks enable row level security;

drop policy if exists "desks visible" on public.desks;
create policy "desks visible" on public.desks for select
  using (public.space_visible(space_id));

drop policy if exists "claim desk" on public.desks;
create policy "claim desk" on public.desks for insert
  with check (auth.uid() = owner_id and public.space_visible(space_id));

drop policy if exists "update own desk" on public.desks;
create policy "update own desk" on public.desks for update
  using (auth.uid() = owner_id or public.is_space_admin(space_id, auth.uid()));

drop policy if exists "release desk" on public.desks;
create policy "release desk" on public.desks for delete
  using (auth.uid() = owner_id or public.is_space_admin(space_id, auth.uid()));

drop trigger if exists desks_touch on public.desks;
create trigger desks_touch before update on public.desks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- desk_notes: ?곗뒪?ъ뿉 ?④린??履쎌?/?좊Ъ (鍮꾨룞湲?
-- ---------------------------------------------------------------
create table if not exists public.desk_notes (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces(id) on delete cascade,
  desk_object_id text not null,
  to_user        uuid not null references auth.users(id) on delete cascade,
  from_name      text not null default 'anonymous',
  message        text not null,
  gift           text,
  read           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists desk_notes_to_idx on public.desk_notes(to_user, read);
alter table public.desk_notes enable row level security;

drop policy if exists "leave note" on public.desk_notes;
create policy "leave note" on public.desk_notes for insert
  with check (auth.uid() is not null and public.space_visible(space_id));

drop policy if exists "read own notes" on public.desk_notes;
create policy "read own notes" on public.desk_notes for select
  using (to_user = auth.uid());

drop policy if exists "mark note read" on public.desk_notes;
create policy "mark note read" on public.desk_notes for update
  using (to_user = auth.uid());

drop policy if exists "delete own notes" on public.desk_notes;
create policy "delete own notes" on public.desk_notes for delete
  using (to_user = auth.uid());

-- ---------------------------------------------------------------
-- meetings: ?뚯쓽 ?덉빟 (?대? 罹섎┛?? .ics ?대낫?닿린 吏??
-- ---------------------------------------------------------------
create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  room_id       uuid not null references public.rooms(id) on delete cascade,
  title         text not null,
  location_kind text not null default 'area' check (location_kind in ('area','desk','spawn')),
  location_ref  text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_by    uuid not null references auth.users(id) on delete cascade,
  creator_name  text,
  created_at    timestamptz not null default now()
);
create index if not exists meetings_space_idx on public.meetings(space_id, starts_at);
alter table public.meetings enable row level security;

drop policy if exists "meetings visible" on public.meetings;
create policy "meetings visible" on public.meetings for select
  using (public.space_visible(space_id));

drop policy if exists "members create meetings" on public.meetings;
create policy "members create meetings" on public.meetings for insert
  with check (auth.uid() = created_by and public.space_visible(space_id));

drop policy if exists "creator manages meetings" on public.meetings;
create policy "creator manages meetings" on public.meetings for update
  using (created_by = auth.uid() or public.is_space_admin(space_id, auth.uid()));

drop policy if exists "creator deletes meetings" on public.meetings;
create policy "creator deletes meetings" on public.meetings for delete
  using (created_by = auth.uid() or public.is_space_admin(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- dm_messages: 1:1 ?ㅼ씠?됲듃 硫붿떆吏 (濡쒓렇???좎? 媛??곸냽 ???
-- ---------------------------------------------------------------
create table if not exists public.dm_messages (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid references public.spaces(id) on delete cascade,
  from_id    uuid not null references auth.users(id) on delete cascade,
  from_name      text not null default 'anonymous',
  to_id      uuid not null references auth.users(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists dm_pair_idx on public.dm_messages(from_id, to_id, created_at);
create index if not exists dm_to_idx on public.dm_messages(to_id, created_at);
alter table public.dm_messages enable row level security;

drop policy if exists "send dm" on public.dm_messages;
create policy "send dm" on public.dm_messages for insert
  with check (auth.uid() = from_id);

drop policy if exists "read own dm" on public.dm_messages;
create policy "read own dm" on public.dm_messages for select
  using (auth.uid() = from_id or auth.uid() = to_id);

-- ---------------------------------------------------------------
-- bulletin_posts: 寃뚯떆???ㅻ툕?앺듃??湲
-- ---------------------------------------------------------------
create table if not exists public.bulletin_posts (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  object_id   text not null,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text not null default 'anonymous',
  content     text not null,
  url         text,
  created_at  timestamptz not null default now()
);
create index if not exists bulletin_obj_idx on public.bulletin_posts(room_id, object_id, created_at);
alter table public.bulletin_posts enable row level security;

drop policy if exists "posts visible" on public.bulletin_posts;
create policy "posts visible" on public.bulletin_posts for select
  using (public.space_visible(space_id));

drop policy if exists "logged in post" on public.bulletin_posts;
create policy "logged in post" on public.bulletin_posts for insert
  with check (auth.uid() is not null and public.space_visible(space_id));

drop policy if exists "author or mod delete post" on public.bulletin_posts;
create policy "author or mod delete post" on public.bulletin_posts for delete
  using (author_id = auth.uid() or public.is_space_mod(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- whiteboards: ?붿씠?몃낫???곸냽??(URL 怨듭쑀??
-- ---------------------------------------------------------------
create table if not exists public.whiteboards (
  id         uuid primary key default gen_random_uuid(),
  board_key  text unique not null,   -- "<spaceId>:<objectId>" ?먮뒗 "annot:<...>"
  space_id   uuid references public.spaces(id) on delete cascade,
  ops        jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.whiteboards enable row level security;

drop policy if exists "boards visible" on public.whiteboards;
create policy "boards visible" on public.whiteboards for select using (true);

drop policy if exists "logged in create board" on public.whiteboards;
create policy "logged in create board" on public.whiteboards for insert
  with check (auth.uid() is not null);

drop policy if exists "logged in update board" on public.whiteboards;
create policy "logged in update board" on public.whiteboards for update
  using (auth.uid() is not null);

drop trigger if exists whiteboards_touch on public.whiteboards;
create trigger whiteboards_touch before update on public.whiteboards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- guest_logs: guest check-in logs
-- ---------------------------------------------------------------
create table if not exists public.guest_logs (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  guest_key   text not null,
  guest_name  text not null default 'guest',
  approved_by text,
  entered_at  timestamptz not null default now()
);

create index if not exists guest_logs_space_idx
  on public.guest_logs(space_id, entered_at);

alter table public.guest_logs enable row level security;

drop policy if exists "anyone logs entry" on public.guest_logs;
create policy "anyone logs entry"
  on public.guest_logs for insert
  with check (true);

drop policy if exists "admins read guest log" on public.guest_logs;
create policy "admins read guest log"
  on public.guest_logs for select
  using (public.is_space_admin(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- analytics_events: analytics event logs
-- ---------------------------------------------------------------
create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  room_id    uuid,
  user_key   text not null,
  user_name  text,
  kind       text not null,
  value      numeric,
  created_at timestamptz not null default now()
);

create index if not exists analytics_space_idx
  on public.analytics_events(space_id, created_at);

alter table public.analytics_events enable row level security;

drop policy if exists "anyone writes analytics" on public.analytics_events;
create policy "anyone writes analytics"
  on public.analytics_events for insert
  with check (true);

drop policy if exists "admins read analytics" on public.analytics_events;
create policy "admins read analytics"
  on public.analytics_events for select
  using (public.is_space_admin(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- blocks: user block list
-- ---------------------------------------------------------------
create table if not exists public.blocks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  blocked_key text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, blocked_key)
);

alter table public.blocks enable row level security;

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks"
  on public.blocks for select
  using (user_id = auth.uid());

drop policy if exists "add block" on public.blocks;
create policy "add block"
  on public.blocks for insert
  with check (user_id = auth.uid());

drop policy if exists "remove block" on public.blocks;
create policy "remove block"
  on public.blocks for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- backfill: add Grand Prix Circuit room to spaces created before this update
-- ---------------------------------------------------------------
insert into public.rooms (space_id, name, template_key, sort_order)
select s.id, 'Grand Prix Circuit', 'circuit', 3
from public.spaces s
where not exists (
  select 1 from public.rooms r where r.space_id = s.id and r.template_key = 'circuit'
);
