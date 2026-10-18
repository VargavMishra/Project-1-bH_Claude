-- =============================================================================
-- Audit log: who changed which profile fields, and when.
--
-- Stores field NAMES only, never values, so it holds no extra personal data.
-- Written by an AFTER trigger inside the same transaction as the profile change:
-- if the audit insert fails, the profile change is rolled back too (all-or-nothing).
-- =============================================================================

create table public.profile_audit_log (
  id             bigint generated always as identity primary key,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  -- auth.uid() of the end user who made the change. NULL means the change did not
  -- come from a signed-in user (dashboard SQL editor, secret-key script, migration),
  -- which makes manual edits visible during a demo.
  actor_id       uuid,
  action         text not null check (action in ('insert', 'update')),
  changed_fields text[] not null,
  created_at     timestamptz not null default now()
);

comment on table public.profile_audit_log is 'Append-only record of profile changes (field names only). Written by trigger.';

create index profile_audit_log_profile_created_idx
  on public.profile_audit_log (profile_id, created_at desc);

-- Users may read their own history; nobody may write it directly.
alter table public.profile_audit_log enable row level security;
revoke all on table public.profile_audit_log from anon, authenticated;
grant select on table public.profile_audit_log to authenticated;

create policy "profile_audit_log: owner can read"
  on public.profile_audit_log for select
  to authenticated
  using ((select auth.uid()) = profile_id);

-- SECURITY DEFINER: runs with the privileges of the function owner (the migration
-- role), so it can insert audit rows even though `authenticated` cannot.
-- search_path = '' prevents a caller from substituting their own objects.
create function private.log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields text[];
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(key order by key), '{}')
      into fields
      from jsonb_object_keys(to_jsonb(new)) as key
     where key not in ('id', 'created_at', 'updated_at');
  else
    select coalesce(array_agg(n.key order by n.key), '{}')
      into fields
      from jsonb_each(to_jsonb(new)) as n
     where n.key <> 'updated_at'
       and n.value is distinct from (to_jsonb(old) -> n.key);

    -- Nothing user-visible changed: no audit entry.
    if cardinality(fields) = 0 then
      return null;
    end if;
  end if;

  insert into public.profile_audit_log (profile_id, actor_id, action, changed_fields)
  values (new.id, auth.uid(), lower(tg_op), fields);

  return null; -- return value of an AFTER trigger is ignored
end;
$$;

revoke all on function private.log_profile_change() from public;

create trigger profiles_audit
  after insert or update on public.profiles
  for each row
  execute function private.log_profile_change();
