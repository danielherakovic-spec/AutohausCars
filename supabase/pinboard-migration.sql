-- v18: shared pinboard. Run once in the existing project's SQL Editor.
-- Does not modify vehicle data, access passwords or existing workspace RPCs.
begin;
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
declare v_workspace uuid; v_board public.av_pinboards; v_cards jsonb; v_edges jsonb;
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
  update public.av_pinboards set state=jsonb_build_object('version',1,'cards',v_cards,'edges',v_edges), revision=revision+1, updated_at=now()
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
commit;
