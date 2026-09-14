-- Traffic metrics: Engaged Visitors as the primary KPI, not raw browser
-- identities.
--
-- Investigation on 2026-09-14 found that "unique_visitors" — anyone whose
-- browser fired even one analytics event, the landing page alone included —
-- was dominated by traffic that never reached the deck: of 87 non-test
-- visitor ids at the time, 84 never fired session_started, and roughly a
-- third of those arrived in tight sub-2-to-10-second bursts alongside other
-- brand-new ids (one pair 81 *microseconds* apart) — the signature of
-- link-preview fetchers and automated crawlers hitting a newly-public
-- domain, not people. See docs/migration-notes.md's 2026-09-14 entries.
--
-- admin_traffic now leads with engaged_visitors (distinct visitor_id that
-- reached session_started) and keeps the raw, unfiltered counts available
-- as diagnostics: unique_visitors (unchanged definition) and
-- one_event_visitors (visitor ids whose entire recorded history is a
-- single event — the population most likely to be automated).

drop function if exists public.admin_traffic(boolean);

create function public.admin_traffic(include_test boolean default false)
returns table (
  engaged_visitors   bigint,
  unique_visitors    bigint,
  one_event_visitors bigint,
  sessions_opened    bigint,
  sessions_started   bigint,
  sessions_completed bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with scoped as (
    select *
    from public.analytics_events e
    where public.is_admin() and (include_test or not e.is_test)
  ),
  per_visitor as (
    select
      visitor_id,
      count(*) as n_events,
      count(*) filter (where name = 'session_started') as n_started
    from scoped
    group by visitor_id
  )
  select
    (select count(*) from per_visitor where n_started > 0),
    (select count(*) from per_visitor),
    (select count(*) from per_visitor where n_events = 1),
    (select count(distinct session_id) from scoped where name = 'app_opened'),
    (select count(distinct session_id) from scoped where name = 'session_started'),
    (select count(distinct session_id) from scoped where name = 'session_completed');
$$;

revoke all on function public.admin_traffic(boolean) from public, anon;
grant execute on function public.admin_traffic(boolean) to authenticated;
