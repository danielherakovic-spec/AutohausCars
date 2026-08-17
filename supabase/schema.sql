-- AutoValue Pro: einmal vollständig im Supabase SQL Editor ausführen.
-- Der Publishable/Anon-Key darf im Browser stehen; Sicherheit wird durch Auth + RLS hergestellt.

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

create table if not exists private.av_workspace_invites (
  code_hash text primary key,
  workspace_id uuid not null unique references public.av_workspaces(id) on delete cascade,
  created_at timestamptz not null default now()
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

-- Direct table changes are deliberately not exposed. The RPC below validates membership
-- and merges concurrent vehicle/task edits server-side.
revoke all on table public.av_workspaces from anon, authenticated;
revoke all on table public.av_workspace_members from anon, authenticated;
grant select on table public.av_workspaces, public.av_workspace_members to authenticated;
revoke all on table private.av_workspace_invites from public, anon, authenticated;

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

create or replace function public.av_create_workspace(p_join_code text, p_display_name text)
returns table (workspace_id uuid, state jsonb, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_state jsonb := jsonb_build_object(
    'version', 1,
    'vehicles', '[]'::jsonb,
    'tasks', '[]'::jsonb,
    'updatedAt', to_jsonb(now()),
    'lastModifiedBy', null
  );
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_code_hash text;
begin
  if auth.uid() is null then
    raise exception 'Bitte zuerst anmelden.' using errcode = '42501';
  end if;
  if char_length(v_display_name) < 2 or char_length(v_display_name) > 80 then
    raise exception 'Bitte einen Namen zwischen 2 und 80 Zeichen eingeben.';
  end if;
  if char_length(btrim(coalesce(p_join_code, ''))) < 16 then
    raise exception 'Der Einladungs-Code ist ungültig.';
  end if;
  if exists (select 1 from public.av_workspace_members where user_id = auth.uid()) then
    raise exception 'Dieses Konto gehört bereits zu einem gemeinsamen Bereich.';
  end if;

  v_code_hash := encode(extensions.digest(btrim(p_join_code), 'sha256'), 'hex');
  insert into public.av_workspaces (state) values (v_state) returning id into v_workspace_id;
  insert into public.av_workspace_members (workspace_id, user_id, display_name)
  values (v_workspace_id, auth.uid(), v_display_name);
  insert into private.av_workspace_invites (code_hash, workspace_id)
  values (v_code_hash, v_workspace_id);

  return query select v_workspace_id, v_state, v_display_name;
end;
$$;

create or replace function public.av_join_workspace(p_join_code text, p_display_name text)
returns table (workspace_id uuid, state jsonb, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_state jsonb;
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_existing_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Bitte zuerst anmelden.' using errcode = '42501';
  end if;
  if char_length(v_display_name) < 2 or char_length(v_display_name) > 80 then
    raise exception 'Bitte einen Namen zwischen 2 und 80 Zeichen eingeben.';
  end if;
  select workspace_id into v_workspace_id
  from private.av_workspace_invites
  where code_hash = encode(extensions.digest(btrim(coalesce(p_join_code, '')), 'sha256'), 'hex');
  if v_workspace_id is null then
    raise exception 'Der Einladungs-Code ist nicht gültig.' using errcode = '22023';
  end if;

  select workspace_id into v_existing_workspace_id
  from public.av_workspace_members
  where user_id = auth.uid();
  if v_existing_workspace_id is not null and v_existing_workspace_id <> v_workspace_id then
    raise exception 'Dieses Konto gehört bereits zu einem anderen gemeinsamen Bereich.';
  end if;
  if v_existing_workspace_id is null then
    if (select count(*) from public.av_workspace_members where workspace_id = v_workspace_id) >= 2 then
      raise exception 'Dieser gemeinsame Bereich hat bereits zwei Personen.' using errcode = '22023';
    end if;
    insert into public.av_workspace_members (workspace_id, user_id, display_name)
    values (v_workspace_id, auth.uid(), v_display_name);
  end if;

  select w.state into v_state from public.av_workspaces w where w.id = v_workspace_id;
  return query select v_workspace_id, v_state, v_display_name;
end;
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
    raise exception 'Kein gemeinsamer Bereich für dieses Konto gefunden.' using errcode = '42501';
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

revoke all on function public.av_create_workspace(text, text) from public, anon;
revoke all on function public.av_join_workspace(text, text) from public, anon;
revoke all on function public.av_save_workspace_state(jsonb) from public, anon;
grant execute on function public.av_create_workspace(text, text) to authenticated;
grant execute on function public.av_join_workspace(text, text) to authenticated;
grant execute on function public.av_save_workspace_state(jsonb) to authenticated;

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
