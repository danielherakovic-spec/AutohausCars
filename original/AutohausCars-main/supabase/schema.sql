-- AutoValue Pro: complete schema for a NEW project with one shared password.
-- For an EXISTING e-mail/invite installation, run shared-password-migration.sql instead.
-- The actual shared password is never written to this file or the web app.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.av_workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  state jsonb not null default jsonb_build_object(
    'version', 1,
    'vehicles', '[]'::jsonb,
    'tasks', '[]'::jsonb,
    'updatedAt', to_jsonb(now()),
    'lastModifiedBy', null
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(state) = 'object')
);

create table if not exists public.av_workspace_members (
  workspace_id uuid not null references public.av_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (user_id)
);

create table if not exists private.av_shared_access_config (
  singleton boolean primary key default true check (singleton),
  password_hash text,
  workspace_id uuid references public.av_workspaces(id) on delete set null,
  configured_at timestamptz,
  check (password_hash is null or char_length(password_hash) >= 20)
);

alter table public.av_workspaces enable row level security;
alter table public.av_workspace_members enable row level security;

drop policy if exists "av members read own membership" on public.av_workspace_members;
create policy "av members read own membership"
on public.av_workspace_members for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "av members read own workspace" on public.av_workspaces;
create policy "av members read own workspace"
on public.av_workspaces for select to authenticated
using (
  id in (
    select workspace_id
    from public.av_workspace_members
    where user_id = (select auth.uid())
  )
);

-- Browser sessions may read only their own membership and workspace. All mutations
-- go through the restricted RPCs below, which merge concurrent entity changes.
revoke all on table public.av_workspaces from anon, authenticated;
revoke all on table public.av_workspace_members from anon, authenticated;
grant select on table public.av_workspaces, public.av_workspace_members to authenticated;
revoke all on table private.av_shared_access_config from public, anon, authenticated, service_role;

insert into private.av_shared_access_config (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function private.av_merge_entities(p_current jsonb, p_incoming jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with candidates as (
    select value as entity, 0 as priority
    from jsonb_array_elements(case when jsonb_typeof(p_current) = 'array' then p_current else '[]'::jsonb end)
    union all
    select value as entity, 1 as priority
    from jsonb_array_elements(case when jsonb_typeof(p_incoming) = 'array' then p_incoming else '[]'::jsonb end)
  ), valid as (
    select
      entity,
      priority,
      coalesce(
        nullif(entity ->> 'deletedAt', '')::timestamptz,
        nullif(entity ->> 'updatedAt', '')::timestamptz,
        nullif(entity ->> 'createdAt', '')::timestamptz,
        'epoch'::timestamptz
      ) as entity_time
    from candidates
    where coalesce(entity ->> 'id', '') <> ''
  ), chosen as (
    select distinct on (entity ->> 'id') entity, entity_time, priority
    from valid
    order by entity ->> 'id', entity_time desc, priority desc
  )
  select coalesce(jsonb_agg(entity order by entity_time desc, priority desc), '[]'::jsonb)
  from chosen;
$$;

create or replace function public.av_save_workspace_state(p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name text;
  v_current_state jsonb;
  v_next_state jsonb;
begin
  if auth.uid() is null then
    raise exception 'Bitte erneut anmelden.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_state) <> 'object'
     or coalesce(jsonb_typeof(p_state -> 'vehicles'), 'null') <> 'array'
     or coalesce(jsonb_typeof(p_state -> 'tasks'), 'null') <> 'array' then
    raise exception 'Ungültiger Datenstand.' using errcode = '22023';
  end if;

  select w.id, w.state, m.display_name
    into v_workspace_id, v_current_state, v_name
  from public.av_workspaces w
  join public.av_workspace_members m on m.workspace_id = w.id
  where m.user_id = auth.uid()
  for update of w;
  if v_workspace_id is null then
    raise exception 'Kein gemeinsamer Bereich für diese Sitzung gefunden.' using errcode = '42501';
  end if;

  v_next_state := jsonb_build_object(
    'version', coalesce((v_current_state ->> 'version')::integer, 0) + 1,
    'vehicles', private.av_merge_entities(v_current_state -> 'vehicles', p_state -> 'vehicles'),
    'tasks', private.av_merge_entities(v_current_state -> 'tasks', p_state -> 'tasks'),
    'updatedAt', to_jsonb(now()),
    'lastModifiedBy', v_name
  );
  update public.av_workspaces
  set state = v_next_state, updated_at = now()
  where id = v_workspace_id;
  return v_next_state;
end;
$$;

-- The browser calls this only after it has an authenticated anonymous session.
-- The function uses auth.uid() itself; it never trusts a browser-supplied user id.
create or replace function public.av_enter_shared_workspace(p_password text)
returns table (workspace_id uuid, state jsonb, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_anonymous boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_password_hash text;
  v_workspace_id uuid;
  v_state jsonb;
  v_display_name text := 'Gemeinsamer Zugriff';
begin
  if v_user_id is null or coalesce(btrim(p_password), '') = '' then
    raise exception 'Zugang nicht möglich.' using errcode = '42501';
  end if;
  if not coalesce(v_is_anonymous, false) then
    raise exception 'Zugang nicht möglich.' using errcode = '42501';
  end if;
  select password_hash into v_password_hash
  from private.av_shared_access_config where singleton = true;
  if v_password_hash is null then
    raise exception 'Das gemeinsame Zugangs-Passwort wurde noch nicht eingerichtet.' using errcode = '55000';
  end if;
  if extensions.crypt(p_password, v_password_hash) is distinct from v_password_hash then
    raise exception 'Zugang nicht möglich.' using errcode = '42501';
  end if;

  select w.id, w.state into v_workspace_id, v_state
  from public.av_workspaces w
  join private.av_shared_access_config config on config.workspace_id = w.id
  where config.singleton = true
  for update of w;
  if v_workspace_id is null then
    insert into public.av_workspaces (state)
    values (jsonb_build_object(
      'version', 1, 'vehicles', '[]'::jsonb, 'tasks', '[]'::jsonb,
      'updatedAt', to_jsonb(now()), 'lastModifiedBy', null
    )) returning id, state into v_workspace_id, v_state;
    update private.av_shared_access_config
    set workspace_id = v_workspace_id
    where singleton = true;
  end if;

  insert into public.av_workspace_members (workspace_id, user_id, display_name)
  values (v_workspace_id, v_user_id, v_display_name)
  on conflict (user_id) do update
  set workspace_id = excluded.workspace_id, display_name = excluded.display_name;
  return query select v_workspace_id, v_state, v_display_name;
end;
$$;

revoke all on function public.av_save_workspace_state(jsonb) from public, anon;
revoke all on function public.av_enter_shared_workspace(text) from public, anon;
grant execute on function public.av_save_workspace_state(jsonb) to authenticated;
grant execute on function public.av_enter_shared_workspace(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "av users read workspace photos" on storage.objects;
drop policy if exists "av users upload workspace photos" on storage.objects;
drop policy if exists "av users update workspace photos" on storage.objects;
drop policy if exists "av users delete workspace photos" on storage.objects;
create policy "av users read workspace photos" on storage.objects for select to authenticated
using (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] in (select workspace_id::text from public.av_workspace_members where user_id = (select auth.uid())));
create policy "av users upload workspace photos" on storage.objects for insert to authenticated
with check (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] in (select workspace_id::text from public.av_workspace_members where user_id = (select auth.uid())));
create policy "av users update workspace photos" on storage.objects for update to authenticated
using (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] in (select workspace_id::text from public.av_workspace_members where user_id = (select auth.uid())))
with check (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] in (select workspace_id::text from public.av_workspace_members where user_id = (select auth.uid())));
create policy "av users delete workspace photos" on storage.objects for delete to authenticated
using (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] in (select workspace_id::text from public.av_workspace_members where user_id = (select auth.uid())));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'av_workspaces'
  ) then
    alter publication supabase_realtime add table public.av_workspaces;
  end if;
end;
$$;

-- In a separate, unsaved SQL Editor query, set the password like this:
-- update private.av_shared_access_config
-- set password_hash = extensions.crypt('PASTE_A_NEW_LONG_SHARED_PASSWORD_HERE', extensions.gen_salt('bf', 12)),
--     configured_at = now()
-- where singleton = true;
