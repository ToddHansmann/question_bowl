-- Recorded from supabase_migrations.schema_migrations on 2026-09-13.
-- Already applied to QB Production; committed so the repo holds the full history.

drop function if exists public.admin_traffic(boolean);

-- Unique visitors should count everyone who loaded the app, including
-- someone who never tapped past the landing screen — so it counts distinct
-- visitors across every event rather than only those who started a session.
-- `sessions_opened` is added alongside so the landing screen's drop-off
-- (opened vs. started) is visible without another function.
create function public.admin_traffic(include_test boolean default false)
returns table (
  unique_visitors    bigint,
  sessions_opened    bigint,
  sessions_started   bigint,
  sessions_completed bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(distinct e.visitor_id),
    count(distinct e.session_id) filter (where e.name = 'app_opened'),
    count(distinct e.session_id) filter (where e.name = 'session_started'),
    count(distinct e.session_id) filter (where e.name = 'session_completed')
  from public.analytics_events e
  where public.is_admin()
    and (include_test or not e.is_test);
$$;

revoke all on function public.admin_traffic(boolean) from public, anon;
grant execute on function public.admin_traffic(boolean) to authenticated;
