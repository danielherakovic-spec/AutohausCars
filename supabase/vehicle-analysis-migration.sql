-- Additive only. Existing workspace/password/state RPCs and RLS are unchanged.
begin;
create table if not exists private.av_vehicle_analysis_quota (
  workspace_id uuid primary key references public.av_workspaces(id) on delete cascade,
  quota_day date not null,
  attempts integer not null default 0,
  last_attempt timestamptz not null
);
revoke all on private.av_vehicle_analysis_quota from public, anon, authenticated;

create or replace function public.av_claim_vehicle_analysis()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_day date := (now() at time zone 'UTC')::date;
  v_claimed uuid;
begin
  select workspace_id into v_workspace from public.av_workspace_members where user_id = auth.uid();
  if v_workspace is null then
    raise exception 'Kein berechtigter Workspace.' using errcode = '42501';
  end if;
  insert into private.av_vehicle_analysis_quota as q (workspace_id, quota_day, attempts, last_attempt)
  values (v_workspace, v_day, 1, now())
  on conflict (workspace_id) do update
    set quota_day = v_day,
        attempts = case when q.quota_day = v_day then q.attempts + 1 else 1 end,
        last_attempt = now()
    where q.last_attempt <= now() - interval '2 minutes'
      and (q.quota_day <> v_day or q.attempts < 10)
  returning workspace_id into v_claimed;
  return v_claimed is not null;
end;
$$;
revoke all on function public.av_claim_vehicle_analysis() from public, anon;
grant execute on function public.av_claim_vehicle_analysis() to authenticated;
commit;
