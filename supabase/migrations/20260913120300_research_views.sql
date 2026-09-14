-- Research views: the telemetry tables joined into analysable shapes.
--
-- Views, not tables. Everything here is recomputed from raw rows on every
-- read, so a better definition (of an inferred exit, of dwell) is a
-- `create or replace view`, and history is never rewritten to fit it.
--
-- security_invoker = true on every view: without it, a view runs with its
-- owner's rights and would let the anon key read straight past RLS.
--
--   research_impressions       one row per impression with its exit (reported or inferred)
--   research_nominations       the nomination in effect for each session
--   research_sessions          one row per session with raw counts
--   admin_telemetry_health()   ingestion integrity for the dashboard

create view public.research_impressions
with (security_invoker = true) as
select
  i.impression_id,
  i.session_id,
  i.device_id,
  i.snapshot_id,
  i.display_seq,
  i.card_position,
  i.display_kind,
  i.draw_impression_id,
  i.question_id,
  i.revision_id,
  i.category,
  i.source,
  i.kind,
  i.policy_id,
  i.policy_version,
  i.selection_probability,
  i.candidate_count,
  i.arc_phase,
  i.shown_at,
  i.page_visible_at_show,
  i.telemetry_schema_version,
  i.is_test,
  x.dismissed_at,
  x.exit_action                                   as reported_exit_action,
  -- When the page died without reporting an exit, the last visibility event
  -- says whether it was hidden (background) or not (abandoned).
  coalesce(
    x.exit_action,
    case when lv.state = 'hidden' then 'background' else 'session_abandoned' end
  )                                               as exit_action,
  case
    when x.impression_id is not null then 'reported'
    when lv.state is not null then 'inferred_from_visibility'
    else 'inferred_no_signal'
  end                                             as exit_source,
  coalesce(x.visible_ms, lv.visible_ms)           as visible_ms,
  coalesce(x.obscured_ms, lv.obscured_ms)         as obscured_ms,
  coalesce(x.hidden_ms, lv.hidden_ms)             as hidden_ms,
  x.elapsed_ms,
  exists (
    select 1 from public.impression_feedback f
    where f.impression_id = i.impression_id and f.kind = 'thumb' and f.value = 'up'
  )                                               as thumb_up,
  exists (
    select 1 from public.impression_feedback f
    where f.impression_id = i.impression_id and f.kind = 'thumb' and f.value = 'down'
  )                                               as thumb_down
from public.card_impressions i
left join public.card_exits x on x.impression_id = i.impression_id
left join lateral (
  select v.state, v.visible_ms, v.obscured_ms, v.hidden_ms
  from public.card_visibility_events v
  where v.impression_id = i.impression_id and v.state in ('hidden', 'visible')
  order by v.seq desc
  limit 1
) lv on true;

comment on view public.research_impressions is
  'One row per impression. exit_source says whether the exit was reported by the client or inferred. Impressions from sessions still in progress read as inferred until their exit arrives.';

create view public.research_nominations
with (security_invoker = true) as
select distinct on (n.session_id)
  n.session_id,
  n.device_id,
  n.action = 'nominate' as nominated,
  n.impression_id,
  n.question_id,
  n.revision_id,
  n.card_position,
  n.occurred_at,
  n.is_test
from public.conversation_nominations n
order by n.session_id, n.seq desc;

comment on view public.research_nominations is
  'The best-conversation nomination in effect for each session that ever nominated: the latest nominate/clear event. nominated = false means it was withdrawn.';

create view public.research_sessions
with (security_invoker = true) as
select
  s.session_id,
  s.device_id,
  s.started_at,
  s.catalog_version,
  s.policy_id,
  s.policy_version,
  s.experiment_id,
  s.experiment_arm,
  s.assignment_probability,
  s.display_mode,
  s.is_test,
  (select count(*) from public.card_impressions i where i.session_id = s.session_id)                           as impressions,
  (select count(*) from public.card_impressions i where i.session_id = s.session_id and i.display_kind = 'draw') as draws,
  (select max(i.shown_at) from public.card_impressions i where i.session_id = s.session_id)                    as last_shown_at,
  coalesce((select rn.nominated from public.research_nominations rn where rn.session_id = s.session_id), false) as has_nomination
from public.play_sessions s;

comment on view public.research_sessions is
  'Descriptive counts per session. Not a success metric: more cards is not a better conversation (docs/strategy.md).';

revoke all on public.research_impressions from anon;
revoke all on public.research_nominations from anon;
revoke all on public.research_sessions    from anon;

/* ---------------------------------------------------------------- health --- */

/*
 * Is the pipeline healthy? Counts that reveal broken ingestion, never
 * numbers to grow. A rising `superseded` or `impressions_without_session`
 * is a bug; `inferred_exits` rising faster than impressions means exits are
 * being lost at teardown.
 */
create function public.admin_telemetry_health(include_test boolean default false)
returns table (
  sessions                    bigint,
  impressions                 bigint,
  reported_exits              bigint,
  inferred_exits              bigint,
  superseded_exits            bigint,
  impressions_without_session bigint,
  draws_without_probability   bigint,
  nominations_in_effect       bigint,
  thumbs                      bigint,
  last_received_at            timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select * from public.play_sessions where public.is_admin() and (include_test or not is_test)
  ), i as (
    select * from public.card_impressions where public.is_admin() and (include_test or not is_test)
  ), x as (
    select * from public.card_exits where public.is_admin() and (include_test or not is_test)
  )
  select
    (select count(*) from s),
    (select count(*) from i),
    (select count(*) from x),
    (select count(*) from i where not exists (select 1 from x where x.impression_id = i.impression_id)),
    (select count(*) from x where exit_action = 'superseded'),
    (select count(*) from i where not exists (select 1 from public.play_sessions ps where ps.session_id = i.session_id)),
    (select count(*) from i where display_kind = 'draw' and selection_probability is null),
    (select count(*) from public.research_nominations n
       where public.is_admin() and n.nominated and (include_test or not n.is_test)),
    (select count(*) from public.impression_feedback f
       where public.is_admin() and (include_test or not f.is_test)),
    greatest(
      (select max(received_at) from s),
      (select max(received_at) from i),
      (select max(received_at) from x)
    );
$$;

revoke all on function public.admin_telemetry_health(boolean) from public, anon;
grant execute on function public.admin_telemetry_health(boolean) to authenticated;
