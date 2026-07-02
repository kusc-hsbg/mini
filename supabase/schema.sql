-- =====================================================================
-- PixelTown (Gather Town Clone) — Supabase 전체 스키마
-- Supabase Dashboard > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전합니다 (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- profiles: 유저 프로필 + 캐릭터 외형 + 상태
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text unique,
  display_name   text not null default 'Player',
  skin           text not null default '#f1c27d',
  color          text not null default '#6c8cff',   -- 상의
  pants          text not null default '#1f2937',   -- 하의
  hair           text not null default 'short',
  hair_color     text not null default '#4b3621',
  hat            text not null default 'none',
  face           text not null default 'smile',
  status         text not null default 'available', -- available | busy | dnd
  status_message text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 기존 배포 업그레이드용
alter table public.profiles add column if not exists pants text not null default '#1f2937';
alter table public.profiles add column if not exists hair text not null default 'short';
alter table public.profiles add column if not exists hair_color text not null default '#4b3621';
alter table public.profiles add column if not exists status text not null default 'available';
alter table public.profiles add column if not exists status_message text;

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
-- spaces: 가상 공간 (고유 URL slug 보유)
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
  allowed_domains text[],           -- 이메일 도메인 제한 (null = 제한 없음)
  guest_checkin   boolean not null default false,
  created_at      timestamptz not null default now()
);

-- 비밀번호 해시는 별도 테이블 (RLS로 완전 차단, RPC로만 접근)
create table if not exists public.space_secrets (
  space_id      uuid primary key references public.spaces(id) on delete cascade,
  password_hash text not null
);
alter table public.space_secrets enable row level security;
-- (정책 없음 = 아무도 직접 접근 불가; security definer 함수만 사용)

-- ---------------------------------------------------------------
-- space_members: 역할 (admin / moderator / mapmaker / member)
-- ---------------------------------------------------------------
create table if not exists public.space_members (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member'
             check (role in ('admin','moderator','mapmaker','member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- RLS 재귀를 피하기 위한 helper (security definer)
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

-- 스페이스 생성 시: 오너를 admin 멤버로 + 기본 방 3개 생성
create or replace function public.handle_new_space()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.space_members (space_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict do nothing;
  insert into public.rooms (space_id, name, template_key, sort_order) values
    (new.id, '타운 스퀘어', 'plaza', 0),
    (new.id, '픽셀 오피스', 'office', 1),
    (new.id, '선셋 파크', 'garden', 2);
  return new;
end;
$$;

drop trigger if exists on_space_created on public.spaces;
create trigger on_space_created after insert on public.spaces
  for each row execute function public.handle_new_space();

-- 비밀번호 설정/검증 RPC
create or replace function public.set_space_password(p_space uuid, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_space_admin(p_space, auth.uid()) then
    raise exception 'not allowed';
  end if;
  if p_password is null or length(p_password) = 0 then
    delete from public.space_secrets where space_id = p_space;
    update public.spaces set has_password = false where id = p_space;
  else
    insert into public.space_secrets (space_id, password_hash)
    values (p_space, crypt(p_password, gen_salt('bf')))
    on conflict (space_id) do update set password_hash = excluded.password_hash;
    update public.spaces set has_password = true where id = p_space;
  end if;
end;
$$;

create or replace function public.verify_space_password(p_space uuid, p_password text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.space_secrets
    where space_id = p_space and password_hash = crypt(p_password, password_hash)
  );
$$;

-- ---------------------------------------------------------------
-- space_bans: 밴 목록 (유저 id 또는 게스트 key)
-- ---------------------------------------------------------------
create table if not exists public.space_bans (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  target_key text not null,          -- auth uid 또는 guest_xxx
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
-- rooms: 스페이스 안의 개별 맵
-- ---------------------------------------------------------------
create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  name         text not null,
  template_key text not null default 'plaza',
  map_data     jsonb,               -- 맵 에디터 수정본 (null = 템플릿 그대로)
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
-- desks: 데스크 지정 (오브젝트 id 기준)
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
-- desk_notes: 데스크에 남기는 쪽지/선물 (비동기)
-- ---------------------------------------------------------------
create table if not exists public.desk_notes (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces(id) on delete cascade,
  desk_object_id text not null,
  to_user        uuid not null references auth.users(id) on delete cascade,
  from_name      text not null default '익명',
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
-- meetings: 회의 예약 (내부 캘린더, .ics 내보내기 지원)
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
-- dm_messages: 1:1 다이렉트 메시지 (로그인 유저 간 영속 저장)
-- ---------------------------------------------------------------
create table if not exists public.dm_messages (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid references public.spaces(id) on delete cascade,
  from_id    uuid not null references auth.users(id) on delete cascade,
  from_name  text not null default '',
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
-- bulletin_posts: 게시판 오브젝트의 글
-- ---------------------------------------------------------------
create table if not exists public.bulletin_posts (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  object_id   text not null,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text not null default '익명',
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
-- whiteboards: 화이트보드 영속화 (URL 공유용)
-- ---------------------------------------------------------------
create table if not exists public.whiteboards (
  id         uuid primary key default gen_random_uuid(),
  board_key  text unique not null,   -- "<spaceId>:<objectId>" 또는 "annot:<...>"
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
-- guest_logs: 게스트 체크인 기록
-- ---------------------------------------------------------------
create table if not exists public.guest_logs (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  guest_key   text not null,
  guest_name  text not null default '게스트',
  approved_by text,
  entered_at  timestamptz not null default now()
);
create index if not exists guest_logs_space_idx on public.guest_logs(space_id, entered_at);
alter table public.guest_logs enable row level security;

drop policy if exists "anyone logs entry" on public.guest_logs;
create policy "anyone logs entry" on public.guest_logs for insert with check (true);

drop policy if exists "admins read guest log" on public.guest_logs;
create policy "admins read guest log" on public.guest_logs for select
  using (public.is_space_admin(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- analytics_events: 인사이트용 이벤트 로그
-- ---------------------------------------------------------------
create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  room_id    uuid,
  user_key   text not null,           -- uid 또는 guest key
  user_name  text,
  kind       text not null,           -- join | leave | chat | conv_seconds | online_peak
  value      numeric,
  created_at timestamptz not null default now()
);
create index if not exists analytics_space_idx on public.analytics_events(space_id, created_at);
alter table public.analytics_events enable row level security;

drop policy if exists "anyone writes analytics" on public.analytics_events;
create policy "anyone writes analytics" on public.analytics_events for insert with check (true);

drop policy if exists "admins read analytics" on public.analytics_events;
create policy "admins read analytics" on public.analytics_events for select
  using (public.is_space_admin(space_id, auth.uid()));

-- ---------------------------------------------------------------
-- blocks: 유저 차단 (연결/채팅 차단, 클라이언트에서 적용)
-- ---------------------------------------------------------------
create table if not exists public.blocks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  blocked_key text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, blocked_key)
);
alter table public.blocks enable row level security;

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks for select using (user_id = auth.uid());

drop policy if exists "add block" on public.blocks;
create policy "add block" on public.blocks for insert with check (user_id = auth.uid());

drop policy if exists "remove block" on public.blocks;
create policy "remove block" on public.blocks for delete using (user_id = auth.uid());
