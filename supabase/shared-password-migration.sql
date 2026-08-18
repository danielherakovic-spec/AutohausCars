-- AutoValue Pro: migration from e-mail accounts + invitation codes to one shared password.
-- Run this file ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- It keeps the current vehicle/task data and private photos in the selected workspace.
-- The actual password is deliberately NOT present in this file or in the web app.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.av_shared_access_config (
  singleton boolean primary key default true check (singleton),
  password_hash text,
  workspace_id uuid references public.av_workspaces(id) on delete set null,
  configured_at timestamptz,
  check (password_hash is null or char_length(password_hash) >= 20)
);
alter table private.av_shared_access_config
  add column if not exists workspace_id uuid references public.av_workspaces(id) on delete set null;
revoke all on table private.av_shared_access_config from public, anon, authenticated, service_role;

insert into private.av_shared_access_config (singleton)
values (true)
on conflict (singleton) do nothing;

-- Remember the current shared workspace before old user memberships are revoked.
-- This preserves the existing data even if the old installation had more than one.
update private.av_shared_access_config config
set workspace_id = (
  select w.id
  from public.av_workspaces w
  order by (
    select count(*) from public.av_workspace_members m where m.workspace_id = w.id
  ) desc, w.created_at asc
  limit 1
)
where config.singleton = true and config.workspace_id is null;

-- The Edge Function calls this with its service-role key only after it has checked
-- the caller's anonymous Supabase session. Browser clients cannot execute it directly.
create or replace function public.av_grant_shared_access(p_user_id uuid, p_password text)
returns table (workspace_id uuid, state jsonb, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_password_hash text;
  v_workspace_id uuid;
  v_state jsonb;
  v_display_name text := 'Gemeinsamer Zugriff';
begin
  if p_user_id is null or coalesce(btrim(p_password), '') = '' then
    raise exception 'Zugang nicht möglich.' using errcode = '42501';
  end if;

  select password_hash into v_password_hash
  from private.av_shared_access_config
  where singleton = true;
  if v_password_hash is null then
    raise exception 'Das gemeinsame Zugangs-Passwort wurde noch nicht eingerichtet.' using errcode = '55000';
  end if;
  if extensions.crypt(p_password, v_password_hash) is distinct from v_password_hash then
    raise exception 'Zugang nicht möglich.' using errcode = '42501';
  end if;

  -- Existing installations normally have one workspace. If an installation has more
  -- than one, the one with the most existing members is preserved as the shared one.
  select w.id, w.state into v_workspace_id, v_state
  from public.av_workspaces w
  join private.av_shared_access_config config on config.workspace_id = w.id
  where config.singleton = true
  for update of w;

  if v_workspace_id is null then
    insert into public.av_workspaces (state)
    values (jsonb_build_object(
      'version', 1,
      'vehicles', '[]'::jsonb,
      'tasks', '[]'::jsonb,
      'updatedAt', to_jsonb(now()),
      'lastModifiedBy', null
    ))
    returning id, state into v_workspace_id, v_state;
    update private.av_shared_access_config
    set workspace_id = v_workspace_id
    where singleton = true;
  end if;

  insert into public.av_workspace_members (workspace_id, user_id, display_name)
  values (v_workspace_id, p_user_id, v_display_name)
  on conflict (user_id) do update
  set workspace_id = excluded.workspace_id,
      display_name = excluded.display_name;

  return query select v_workspace_id, v_state, v_display_name;
end;
$$;

revoke all on function public.av_grant_shared_access(uuid, text) from public, anon, authenticated;
grant execute on function public.av_grant_shared_access(uuid, text) to service_role;

-- The old code paths are no longer used. Removing them invalidates old invitation codes.
drop function if exists public.av_create_workspace(text, text);
drop function if exists public.av_join_workspace(text, text);
drop table if exists private.av_workspace_invites;

-- Old e-mail-account memberships are deliberately revoked. Workspace data and photo
-- objects remain intact; each device receives a new technical membership after it
-- supplies the shared password through the new Edge Function.
delete from public.av_workspace_members;

-- Set this immediately in the same SQL Editor session. Replace only the text inside
-- the quotes before running it. Do not commit this statement after inserting a real password.
-- update private.av_shared_access_config
-- set password_hash = extensions.crypt('PASTE_A_NEW_LONG_SHARED_PASSWORD_HERE', extensions.gen_salt('bf', 12)),
--     configured_at = now()
-- where singleton = true;
