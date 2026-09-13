-- Recorded from supabase_migrations.schema_migrations on 2026-09-13.
-- Already applied to QB Production; committed so the repo holds the full history.
-- (admin_traffic and admin_ratings_by_question were later replaced; see
-- 20260909191244 and 20260909201204.)

-- Dashboard metrics.
--
-- SECURITY DEFINER so the aggregate can run over the raw tables, with an
-- explicit is_admin() gate at the top of each — the function is the only way
-- anon could reach this data, and it refuses. Every one takes
-- `include_test`, defaulting to false: admin activity is excluded unless
-- someone deliberately asks to see it.

create or replace function public.admin_traffic(include_test boolean default false)
returns table (
  unique_visitors    bigint,
  sessions_started   bigint,
  sessions_completed bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(distinct e.visitor_id)
      filter (where e.name = 'session_started'),
    count(distinct e.session_id)
      filter (where e.name = 'session_started'),
    count(distinct e.session_id)
      filter (where e.name = 'session_completed')
  from public.analytics_events e
  where public.is_admin()
    and (include_test or not e.is_test);
$$;

create or replace function public.admin_engagement(include_test boolean default false)
returns table (
  total_ratings     bigint,
  thumbs_up         bigint,
  thumbs_down       bigint,
  positive_pct      numeric,
  total_suggestions bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with r as (
    select value from public.question_ratings
    where public.is_admin() and (include_test or not is_test)
  ), s as (
    select 1 from public.question_suggestions
    where public.is_admin() and (include_test or not is_test)
  )
  select
    (select count(*) from r),
    (select count(*) from r where value = 'up'),
    (select count(*) from r where value = 'down'),
    case when (select count(*) from r) = 0 then null
         else round(100.0 * (select count(*) from r where value = 'up')
                          / (select count(*) from r), 1) end,
    (select count(*) from s);
$$;

-- Base questions have no category; they report as 'Base' so the cut is
-- complete rather than silently dropping the largest slice.
create or replace function public.admin_ratings_by_category(include_test boolean default false)
returns table (
  category     text,
  thumbs_up    bigint,
  thumbs_down  bigint,
  total        bigint,
  positive_pct numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(r.category, 'Base') as category,
    count(*) filter (where r.value = 'up'),
    count(*) filter (where r.value = 'down'),
    count(*),
    round(100.0 * count(*) filter (where r.value = 'up') / count(*), 1)
  from public.question_ratings r
  where public.is_admin() and (include_test or not r.is_test)
  group by coalesce(r.category, 'Base')
  order by count(*) desc;
$$;

create or replace function public.admin_ratings_by_question(include_test boolean default false)
returns table (
  question_text text,
  category      text,
  source        text,
  thumbs_up     bigint,
  thumbs_down   bigint,
  total         bigint,
  positive_pct  numeric,
  polarization  numeric,
  last_rated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.question_text,
    coalesce(min(r.category), 'Base'),
    min(r.source),
    count(*) filter (where r.value = 'up'),
    count(*) filter (where r.value = 'down'),
    count(*),
    round(100.0 * count(*) filter (where r.value = 'up') / count(*), 1),
    round(100 - 2 * abs(100.0 * count(*) filter (where r.value = 'up') / count(*) - 50), 1),
    max(r.created_at)
  from public.question_ratings r
  where public.is_admin() and (include_test or not r.is_test)
  group by r.question_text
  order by count(*) desc, max(r.created_at) desc;
$$;

create or replace function public.admin_suggestions(include_test boolean default false)
returns table (
  id           uuid,
  text         text,
  category     text,
  is_test      boolean,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.suggested_text, s.suggested_category, s.is_test, s.created_at
  from public.question_suggestions s
  where public.is_admin() and (include_test or not s.is_test)
  order by s.created_at desc;
$$;

revoke all on function public.admin_traffic(boolean)              from public, anon;
revoke all on function public.admin_engagement(boolean)           from public, anon;
revoke all on function public.admin_ratings_by_category(boolean)  from public, anon;
revoke all on function public.admin_ratings_by_question(boolean)  from public, anon;
revoke all on function public.admin_suggestions(boolean)          from public, anon;
grant execute on function public.admin_traffic(boolean)             to authenticated;
grant execute on function public.admin_engagement(boolean)          to authenticated;
grant execute on function public.admin_ratings_by_category(boolean) to authenticated;
grant execute on function public.admin_ratings_by_question(boolean) to authenticated;
grant execute on function public.admin_suggestions(boolean)         to authenticated;
