-- =============================================================================
-- Trigger: keep profiles.updated_at correct automatically.
--
-- A trigger is code that PostgreSQL itself runs as part of a write. It fires for
-- EVERY update to the table — from our API, from the Supabase dashboard, from a
-- script using the secret key — because it lives in the database, not in any client.
--
-- BEFORE UPDATE ... FOR EACH ROW: runs once per changed row, before it is written,
-- and may modify NEW (the row about to be stored).
-- =============================================================================

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- created_at is immutable, whoever performs the update.
  new.created_at := old.created_at;

  -- Only bump the timestamp when something actually changed, so a "save" with no
  -- edits does not look like a modification. now() = start of the current transaction.
  if new is distinct from old then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function private.set_updated_at();
