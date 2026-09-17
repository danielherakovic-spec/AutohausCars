-- AutoValue Pro: replace the legacy Edge Function password check with a Postgres RPC.
-- Run this ONCE after the earlier shared-password migration has completed.
-- It preserves the selected workspace, vehicles, memberships, Realtime, and private photos.

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

  -- Only the anonymous technical session created by the browser may receive access.
  if not coalesce(v_is_anonymous, false) then
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
  values (v_workspace_id, v_user_id, v_display_name)
  on conflict (user_id) do update
  set workspace_id = excluded.workspace_id,
      display_name = excluded.display_name;

  return query select v_workspace_id, v_state, v_display_name;
end;
$$;

-- Remove the legacy service-role-only API so no Edge Function is needed anymore.
drop function if exists public.av_grant_shared_access(uuid, text);
revoke all on function public.av_enter_shared_workspace(text) from public, anon;
grant execute on function public.av_enter_shared_workspace(text) to authenticated;
