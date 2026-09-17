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

  update public.av_workspaces
  set state = v_next_state, updated_at = now()
  where id = v_workspace_id;

  return v_next_state;
end;
$$;

revoke all on function public.av_save_workspace_state_v2(jsonb) from public, anon;
grant execute on function public.av_save_workspace_state_v2(jsonb) to authenticated;
