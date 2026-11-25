-- CarsAutoHaus v20: im bestehenden Projekt ausführen. Wiederholbar.
-- Bestehende Fahrzeuge, Aufgaben, Notizen und Zugangsdaten bleiben erhalten.
begin;
-- CarsAutoHaus: shared calendar appointments and per-vehicle garage records.
-- Run in the SQL Editor of the EXISTING project. No vehicle/password data is replaced.

create table if not exists public.av_workspace_items (
  workspace_id uuid not null references public.av_workspaces(id) on delete cascade,
  scope text not null check (scope in ('calendar','garage')),
  id text not null check (length(id) between 1 and 180),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data)='object'),
  revision bigint not null default 0 check (revision>=0),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,scope,id)
);
alter table public.av_workspace_items enable row level security;
revoke all on public.av_workspace_items from public,anon,authenticated;
grant select on public.av_workspace_items to authenticated;
drop policy if exists "members read calendar and garage" on public.av_workspace_items;
create policy "members read calendar and garage" on public.av_workspace_items
for select to authenticated using(workspace_id in (
  select m.workspace_id from public.av_workspace_members m where m.user_id=(select auth.uid())
));

create or replace function public.av_read_workspace_items(p_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace uuid; v_result jsonb;
begin
  if p_scope is null or p_scope not in ('calendar','garage') then raise exception 'Ungültiger Bereich.' using errcode='22023'; end if;
  select workspace_id into v_workspace from public.av_workspace_members where user_id=auth.uid();
  if v_workspace is null then raise exception 'Bitte am gemeinsamen Bestand anmelden.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(i.data || jsonb_build_object('id',i.id,'_revision',i.revision,'_deleted',i.deleted,'_updatedAt',i.updated_at) order by i.id),'[]'::jsonb)
    into v_result from public.av_workspace_items i where i.workspace_id=v_workspace and i.scope=p_scope;
  return v_result;
end;
$$;

create or replace function public.av_put_workspace_item(p_scope text,p_entity jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace uuid; v_id text; v_item public.av_workspace_items; v_data jsonb;
begin
  if p_scope is null or p_scope not in ('calendar','garage') then raise exception 'Ungültiger Bereich.' using errcode='22023'; end if;
  select workspace_id into v_workspace from public.av_workspace_members where user_id=auth.uid();
  if v_workspace is null then raise exception 'Bitte am gemeinsamen Bestand anmelden.' using errcode='42501'; end if;
  if jsonb_typeof(p_entity) is distinct from 'object' or jsonb_typeof(p_entity->'id') is distinct from 'string'
    or coalesce(length(p_entity->>'id'),0) not between 1 and 180 or octet_length(p_entity::text)>262144
    or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Ungültiger oder zu großer Eintrag (maximal 256 KB).' using errcode='22023';
  end if;
  v_id:=p_entity->>'id';
  -- ON CONFLICT plus FOR UPDATE also serializes two simultaneous creations.
  insert into public.av_workspace_items(workspace_id,scope,id,deleted) values(v_workspace,p_scope,v_id,true) on conflict do nothing;
  select * into v_item from public.av_workspace_items where workspace_id=v_workspace and scope=p_scope and id=v_id for update;
  if v_item.revision<>p_expected_revision then
    raise exception 'Der Eintrag wurde zwischenzeitlich geändert. Bitte den aktuellen Stand laden und deine Änderung erneut übernehmen.' using errcode='40001';
  end if;
  v_data:=p_entity - array['_revision','_deleted','_updatedAt','workspace_id','scope'];
  update public.av_workspace_items set data=v_data,revision=revision+1,deleted=false,updated_at=now()
    where workspace_id=v_workspace and scope=p_scope and id=v_id returning * into v_item;
  return v_item.data || jsonb_build_object('id',v_item.id,'_revision',v_item.revision,'_deleted',v_item.deleted,'_updatedAt',v_item.updated_at);
end;
$$;

create or replace function public.av_remove_workspace_item(p_scope text,p_id text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace uuid; v_item public.av_workspace_items;
begin
  if p_scope is null or p_scope not in ('calendar','garage') then raise exception 'Ungültiger Bereich.' using errcode='22023'; end if;
  select workspace_id into v_workspace from public.av_workspace_members where user_id=auth.uid();
  if v_workspace is null then raise exception 'Bitte am gemeinsamen Bestand anmelden.' using errcode='42501'; end if;
  if p_id is null or length(p_id) not between 1 and 180 or p_expected_revision is null or p_expected_revision<1 then
    raise exception 'Ungültige Eintragsversion.' using errcode='22023';
  end if;
  select * into v_item from public.av_workspace_items where workspace_id=v_workspace and scope=p_scope and id=p_id for update;
  if not found or v_item.revision<>p_expected_revision then
    raise exception 'Der Eintrag wurde zwischenzeitlich geändert. Bitte den aktuellen Stand laden.' using errcode='40001';
  end if;
  -- Keep a tombstone so a stale browser cannot recreate a removed record.
  update public.av_workspace_items set data=jsonb_build_object('id',p_id),revision=revision+1,deleted=true,updated_at=now()
    where workspace_id=v_workspace and scope=p_scope and id=p_id returning * into v_item;
  return v_item.data || jsonb_build_object('id',v_item.id,'_revision',v_item.revision,'_deleted',true,'_updatedAt',v_item.updated_at);
end;
$$;
revoke all on function public.av_read_workspace_items(text) from public,anon;
revoke all on function public.av_put_workspace_item(text,jsonb,bigint) from public,anon;
revoke all on function public.av_remove_workspace_item(text,text,bigint) from public,anon;
grant execute on function public.av_read_workspace_items(text) to authenticated;
grant execute on function public.av_put_workspace_item(text,jsonb,bigint) to authenticated;
grant execute on function public.av_remove_workspace_item(text,text,bigint) to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='av_workspace_items') then
    alter publication supabase_realtime add table public.av_workspace_items;
  end if;
end $$;


-- v18: shared pinboard. Run once in the existing project's SQL Editor.
-- Does not modify vehicle data, access passwords or existing workspace RPCs.

create table if not exists public.av_pinboards (
  workspace_id uuid primary key references public.av_workspaces(id) on delete cascade,
  state jsonb not null default '{"version":1,"cards":[],"edges":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.av_pinboards enable row level security;
revoke all on public.av_pinboards from public, anon, authenticated;
grant select on public.av_pinboards to authenticated;
drop policy if exists "members read shared pinboard" on public.av_pinboards;
create policy "members read shared pinboard" on public.av_pinboards
for select to authenticated using (workspace_id in (
  select m.workspace_id from public.av_workspace_members m where m.user_id = (select auth.uid())
));

-- Deduplicate retries after an interrupted network response.
create table if not exists private.av_pinboard_requests (
  workspace_id uuid not null references public.av_workspaces(id) on delete cascade,
  request_id uuid not null,
  primary key (workspace_id, request_id)
);
revoke all on private.av_pinboard_requests from public, anon, authenticated;

create or replace function private.av_pinboard_patch_items(p_items jsonb, p_patch jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare v_items jsonb; v_item jsonb; v_id text;
begin
  if jsonb_typeof(p_patch) is distinct from 'object'
    or jsonb_typeof(p_patch->'add') is distinct from 'array'
    or jsonb_typeof(p_patch->'update') is distinct from 'array'
    or jsonb_typeof(p_patch->'remove') is distinct from 'array' then
    raise exception 'Ungültige Pinwand-Änderung.' using errcode='22023';
  end if;
  select coalesce(jsonb_object_agg(value->>'id',value),'{}'::jsonb) into v_items from jsonb_array_elements(p_items);
  for v_item in select value from jsonb_array_elements(p_patch->'remove') loop
    if jsonb_typeof(v_item) <> 'string' then raise exception 'Ungültige Karten-ID.' using errcode='22023'; end if;
    v_items := v_items - (v_item #>> '{}');
  end loop;
  for v_item in select value from jsonb_array_elements(p_patch->'add') loop
    v_id := v_item->>'id';
    if jsonb_typeof(v_item) <> 'object' or coalesce(length(v_id),0) not between 1 and 100 then
      raise exception 'Ungültige Karten-ID.' using errcode='22023';
    end if;
    if not (v_items ? v_id) then v_items := jsonb_set(v_items,array[v_id],v_item); end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_patch->'update') loop
    v_id := v_item->>'id';
    if coalesce(length(v_id),0) not between 1 and 100 or jsonb_typeof(v_item->'changes') is distinct from 'object' then
      raise exception 'Ungültige Karten-Änderung.' using errcode='22023';
    end if;
    -- Changes only touch edited fields. Updates never recreate deleted cards.
    if v_items ? v_id then v_items := jsonb_set(v_items,array[v_id],(v_items->v_id) || ((v_item->'changes')-'id')); end if;
  end loop;
  select coalesce(jsonb_agg(v_items->ids.id order by ids.n),'[]'::jsonb) into p_items
  from (select value->>'id' as id,min(ord) as n from jsonb_array_elements(p_items || (p_patch->'add')) with ordinality as entries(value,ord) group by value->>'id') ids
  where v_items ? ids.id;
  return p_items;
end;
$$;
revoke all on function private.av_pinboard_patch_items(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.av_read_pinboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid; v_board public.av_pinboards;
begin
  select workspace_id into v_workspace from public.av_workspace_members where user_id=auth.uid();
  if v_workspace is null then raise exception 'Bitte zuerst am gemeinsamen Bestand anmelden.' using errcode='42501'; end if;
  select * into v_board from public.av_pinboards where workspace_id=v_workspace;
  return jsonb_build_object('revision',coalesce(v_board.revision,0),'state',coalesce(v_board.state,'{"version":1,"cards":[],"edges":[]}'::jsonb));
end;
$$;

create or replace function public.av_patch_pinboard(p_patch jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid; v_board public.av_pinboards; v_cards jsonb; v_edges jsonb; v_background text;
begin
  select workspace_id into v_workspace from public.av_workspace_members where user_id=auth.uid();
  if v_workspace is null then raise exception 'Bitte zuerst am gemeinsamen Bestand anmelden.' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text)>10485760 then
    raise exception 'Ungültige oder zu große Pinwand-Änderung.' using errcode='22023';
  end if;
  insert into public.av_pinboards(workspace_id) values(v_workspace) on conflict do nothing;
  select * into v_board from public.av_pinboards where workspace_id=v_workspace for update;
  if exists(select 1 from private.av_pinboard_requests where workspace_id=v_workspace and request_id=p_request_id) then
    return jsonb_build_object('revision',v_board.revision,'state',v_board.state);
  end if;
  v_background := coalesce(p_patch->>'background',v_board.state->>'background','#10151d');
  if v_background !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Ungültige Hintergrundfarbe.' using errcode='22023'; end if;
  v_cards := private.av_pinboard_patch_items(v_board.state->'cards',p_patch->'cards');
  v_edges := private.av_pinboard_patch_items(v_board.state->'edges',p_patch->'edges');
  if jsonb_array_length(v_cards)>3000 or jsonb_array_length(v_edges)>10000 then raise exception 'Die Pinwand ist zu groß.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(v_cards) c where coalesce(c->>'type','') not in ('car','note','calculator')
      or jsonb_typeof(c->'x') is distinct from 'number' or jsonb_typeof(c->'y') is distinct from 'number') then
    raise exception 'Ungültige Pinwand-Karte.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(e),'[]'::jsonb) into v_edges from jsonb_array_elements(v_edges) e
  where e->>'from' <> e->>'to'
    and exists(select 1 from jsonb_array_elements(v_cards) c where c->>'id'=e->>'from')
    and exists(select 1 from jsonb_array_elements(v_cards) c where c->>'id'=e->>'to');
  update public.av_pinboards set state=jsonb_build_object('version',1,'cards',v_cards,'edges',v_edges,'background',v_background), revision=revision+1, updated_at=now()
  where workspace_id=v_workspace returning * into v_board;
  insert into private.av_pinboard_requests(workspace_id,request_id) values(v_workspace,p_request_id);
  return jsonb_build_object('revision',v_board.revision,'state',v_board.state);
end;
$$;
revoke all on function public.av_read_pinboard() from public, anon;
revoke all on function public.av_patch_pinboard(jsonb,uuid) from public, anon;
grant execute on function public.av_read_pinboard() to authenticated;
grant execute on function public.av_patch_pinboard(jsonb,uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='av_pinboards') then
    alter publication supabase_realtime add table public.av_pinboards;
  end if;
end $$;



-- CarsAutoHaus: additive shared-state RPC for operations, notes and chat.
-- Run once in the Supabase SQL Editor after the existing schema/password RPC.
-- The existing password RPC and configuration are not replaced.

create or replace function public.av_save_workspace_state_v2(p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name text;
  v_current_state jsonb;
  v_current_operations jsonb;
  v_incoming_operations jsonb;
  v_next_operations jsonb;
  v_next_state jsonb;
  v_vehicle jsonb; v_other jsonb; v_old jsonb; v_key text; v_old_key text; v_field text;
begin
  if auth.uid() is null then
    raise exception 'Bitte erneut anmelden.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_state) <> 'object'
     or coalesce(jsonb_typeof(p_state -> 'vehicles'), 'null') <> 'array'
     or coalesce(jsonb_typeof(p_state -> 'tasks'), 'null') <> 'array'
     or (p_state ? 'operations' and jsonb_typeof(p_state -> 'operations') <> 'object') then
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

  v_current_operations := case when jsonb_typeof(v_current_state -> 'operations') = 'object' then v_current_state -> 'operations' else '{}'::jsonb end;
  v_incoming_operations := case when jsonb_typeof(p_state -> 'operations') = 'object' then p_state -> 'operations' else '{}'::jsonb end;
  v_next_operations := v_current_operations || v_incoming_operations;
  v_next_operations := jsonb_set(
    v_next_operations,
    '{chatMessages}',
    private.av_merge_entities(v_current_operations -> 'chatMessages', v_incoming_operations -> 'chatMessages'),
    true
  );
  v_next_operations := jsonb_set(
    v_next_operations,
    '{generalNotes}',
    private.av_merge_entities(v_current_operations -> 'generalNotes', v_incoming_operations -> 'generalNotes'),
    true
  );

  v_next_state := p_state || jsonb_build_object(
    'version', coalesce((v_current_state ->> 'version')::integer, 0) + 1,
    'vehicles', private.av_merge_entities(v_current_state -> 'vehicles', p_state -> 'vehicles'),
    'tasks', private.av_merge_entities(v_current_state -> 'tasks', p_state -> 'tasks'),
    'operations', v_next_operations,
    'updatedAt', to_jsonb(now()),
    'lastModifiedBy', v_name
  );

  -- Reject a newly introduced duplicate identity, including simultaneous saves on two devices.
  -- Existing distinct records are not deleted or merged, preserving their notes and references.
  for v_vehicle in select value from jsonb_array_elements(v_next_state->'vehicles') loop
    if coalesce(v_vehicle->>'deletedAt','')<>'' then continue; end if;
    select value into v_old from jsonb_array_elements(coalesce(v_current_state->'vehicles','[]'::jsonb)) where value->>'id'=v_vehicle->>'id' limit 1;
    foreach v_field in array array['vin','vehicleNumber'] loop
      v_key:=upper(regexp_replace(coalesce(case when v_field='vin' then coalesce(nullif(v_vehicle->>'vin',''),v_vehicle->>'fin') else v_vehicle->>v_field end,''),'\s','','g'));
      v_old_key:=upper(regexp_replace(coalesce(case when v_field='vin' then coalesce(nullif(v_old->>'vin',''),v_old->>'fin') else v_old->>v_field end,''),'\s','','g'));
      if v_key='' or (v_old is not null and v_key=v_old_key) then continue; end if;
      for v_other in select value from jsonb_array_elements(v_next_state->'vehicles') loop
        if v_other->>'id'<>v_vehicle->>'id' and coalesce(v_other->>'deletedAt','')='' and
          upper(regexp_replace(coalesce(case when v_field='vin' then coalesce(nullif(v_other->>'vin',''),v_other->>'fin') else v_other->>v_field end,''),'\s','','g'))=v_key then
          raise exception 'Diese FIN oder Fahrzeugnummer gehört bereits zu einer anderen Akte. Bitte den Bestand neu laden und die bestehende Akte bearbeiten.' using errcode='23505';
        end if;
      end loop;
    end loop;
  end loop;

  update public.av_workspaces
  set state = v_next_state, updated_at = now()
  where id = v_workspace_id;

  return v_next_state;
end;
$$;

revoke all on function public.av_save_workspace_state_v2(jsonb) from public, anon;
grant execute on function public.av_save_workspace_state_v2(jsonb) to authenticated;
-- Older clients receive the same identity protection.
create or replace function public.av_save_workspace_state(p_state jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select public.av_save_workspace_state_v2(p_state);
$$;
revoke all on function public.av_save_workspace_state(jsonb) from public,anon;
grant execute on function public.av_save_workspace_state(jsonb) to authenticated;



commit;
