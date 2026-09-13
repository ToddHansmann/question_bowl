-- Recorded from supabase_migrations.schema_migrations on 2026-09-13.
-- Already applied to QB Production; committed so the repo holds the full history.

drop function if exists public.admin_ratings_by_question(boolean);

-- Group on the stable id, not the text. Before this, rewording a question
-- would have split its history into two rows that never rejoined — the exact
-- failure the ids exist to prevent, reproduced one layer up.
--
-- The label is the most recently recorded wording for that id, so a rewritten
-- question shows its current text while keeping every rating it collected
-- under the old one. Rows written before question_id existed have been
-- backfilled; the coalesce is belt and braces for anything that somehow
-- arrives without one.
create function public.admin_ratings_by_question(include_test boolean default false)
returns table (
  question_id   text,
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
  with scoped as (
    select r.*, coalesce(r.question_id, 'text:' || r.question_text) as key
    from public.question_ratings r
    where public.is_admin() and (include_test or not r.is_test)
  ),
  latest as (
    select distinct on (key) key, question_text, category, source
    from scoped
    order by key, created_at desc
  )
  select
    min(s.question_id),
    l.question_text,
    coalesce(l.category, 'Base'),
    l.source,
    count(*) filter (where s.value = 'up'),
    count(*) filter (where s.value = 'down'),
    count(*),
    round(100.0 * count(*) filter (where s.value = 'up') / count(*), 1),
    round(100 - 2 * abs(100.0 * count(*) filter (where s.value = 'up') / count(*) - 50), 1),
    max(s.created_at)
  from scoped s
  join latest l on l.key = s.key
  group by s.key, l.question_text, l.category, l.source
  order by count(*) desc, max(s.created_at) desc;
$$;

revoke all on function public.admin_ratings_by_question(boolean) from public, anon;
grant execute on function public.admin_ratings_by_question(boolean) to authenticated;
