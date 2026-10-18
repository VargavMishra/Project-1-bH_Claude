-- =============================================================================
-- Profiles: one row per authenticated user.
--
-- Security layers (all enforced by PostgreSQL, independent of the API):
--   1. Grants        – which roles may touch the table / which columns at all.
--   2. Row-level security (RLS) – which ROWS a role may see or change.
--   3. CHECK constraints – which VALUES are acceptable, even via direct API access.
-- =============================================================================

-- Helper functions live in a schema that the Supabase Data API does NOT expose,
-- so they cannot be called directly over HTTP.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Validates a list of short labels (hobbies, strengths):
--   at most max_items entries; each 1..max_len characters with no leading/trailing
--   spaces; no case-insensitive duplicates ("Chess" and "chess").
create function private.is_valid_tag_list(items text[], max_items integer, max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(items) <= max_items
     and not exists (
       select 1
       from unnest(items) as item
       where item is null
          or item <> btrim(item)
          or char_length(item) not between 1 and max_len
     )
     and cardinality(items) = (select count(distinct lower(item)) from unnest(items) as item);
$$;

revoke all on function private.is_valid_tag_list(text[], integer, integer) from public;
grant execute on function private.is_valid_tag_list(text[], integer, integer)
  to authenticated, service_role;

create table public.profiles (
  -- Same value as auth.users.id: the profile IS the identity's profile. Deleting the
  -- auth user deletes the profile (and, via its own FK, the audit rows).
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  bio          text not null default '',
  -- NULL means "not specified".
  gender       text,
  hobbies      text[] not null default '{}',
  strengths    text[] not null default '{}',
  -- Object path inside the private "avatars" storage bucket, e.g. "<user-id>/<file>.webp".
  -- We store the path, not a URL: URLs are short-lived signed links generated on read.
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_display_name_check
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 60),
  constraint profiles_bio_check
    check (char_length(bio) <= 500),
  constraint profiles_gender_check
    check (gender in ('female', 'male', 'non_binary', 'other', 'prefer_not_to_say')),
  constraint profiles_hobbies_check
    check (private.is_valid_tag_list(hobbies, 20, 40)),
  constraint profiles_strengths_check
    check (private.is_valid_tag_list(strengths, 20, 40)),
  -- An avatar must live in the owner's own folder with a safe file name.
  constraint profiles_avatar_path_check
    check (
      avatar_path is null
      or (
        starts_with(avatar_path, id::text || '/')
        and avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$'
      )
    )
);

comment on table public.profiles is 'User-editable profile, one per auth user. Owner-only access via RLS.';
comment on column public.profiles.avatar_path is 'Path in the private "avatars" bucket; served via signed URLs.';
comment on column public.profiles.updated_at is 'Maintained by trigger profiles_set_updated_at; clients cannot write it.';

-- ---------------------------------------------------------------------------
-- 1. Grants. Supabase grants everything on new public tables to the API roles by
--    default; we take that away and grant back only what is needed.
--    anon (not signed in): nothing. authenticated: read, create, and update only the
--    user-editable columns — id, created_at and updated_at can never be set by a client.
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, display_name, bio, gender, hobbies, strengths)
  on table public.profiles to authenticated;
grant update (display_name, bio, gender, hobbies, strengths, avatar_path)
  on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Row-level security: a signed-in user can only see and change their own row.
--    auth.uid() reads the `sub` claim of the verified JWT that Supabase received.
--    Wrapping it in (select ...) lets Postgres evaluate it once per query, not per row.
--    No DELETE policy: profiles are removed only by deleting the auth user.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: owner can create"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: owner can update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
