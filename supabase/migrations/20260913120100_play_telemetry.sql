-- Play telemetry: the permanent record of how conversations unfold.
--
-- The spine of every future recommendation policy. See
-- docs/telemetry-spec.md (the contract), docs/schema.md (the tables) and
-- docs/adr/0001-dedicated-telemetry-tables.md (why these are not rows in
-- analytics_events).
--
--   exit_actions               lookup: how a card can leave the screen
--   play_sessions              one row per session (page load that reached the deck)
--   context_snapshots          the room, each time it changed
--   card_impressions           one row per card shown
--   card_visibility_events     hidden / visible / obscured / unobscured while a card was up
--   card_exits                 one row per card that left the screen (at most one per impression)
--   impression_feedback        thumbs up/down, tied to the exact impression
--   conversation_nominations   "best conversation" nominate / clear events
--
-- Rules every table here follows:
-- - Raw facts only. No scores, no aggregates, nothing that can't be recomputed.
-- - Insert-only for the app (anon + authenticated), select-only for admins.
-- - Append-only: rows are never updated or deleted by anything.
-- - Primary keys are generated on the client, so a retried insert of a row
--   that already arrived fails with 409 rather than duplicating.
-- - No foreign keys between these tables. Rows from one page arrive over
--   separate requests, possibly out of order, possibly days late from an
--   offline outbox; an FK would reject real data. Integrity is checked by
--   the research views and admin_telemetry_health() instead.
-- - Every row carries is_test and telemetry_schema_version.

/* ------------------------------------------------------------ lookups --- */

create table public.exit_actions (
  exit_action text primary key check (exit_action ~ '^[a-z][a-z_]*$'),
  description text not null,
  emitted     boolean not null,
  introduced  date not null
);

-- Mirrors EXIT_ACTIONS in src/telemetry/schema.ts (a test holds them equal).
insert into public.exit_actions (exit_action, description, emitted, introduced) values
  ('next',              'Moved forward to the next card.',                                              true,  '2026-09-13'),
  ('skip',              'Explicitly passed on the card. Reserved; no gesture emits it yet.',            false, '2026-09-13'),
  ('back',              'Returned to the previous card.',                                               true,  '2026-09-13'),
  ('reroll',            'Replaced the card without advancing. Reserved; no control emits it yet.',      false, '2026-09-13'),
  ('background',        'The page was already hidden when it was torn down.',                           true,  '2026-09-13'),
  ('session_abandoned', 'The page was closed or navigated away from while visible.',                    true,  '2026-09-13'),
  ('pool_emptied',      'Every pack was switched off, so no card was showing.',                         true,  '2026-09-13'),
  ('superseded',        'A new card was shown without the previous one closing. A client bug if seen.', true,  '2026-09-13');

/* ------------------------------------------------------------ sessions --- */

create table public.play_sessions (
  session_id               uuid primary key,
  device_id                uuid not null,
  started_at               timestamptz not null,
  received_at              timestamptz not null default now(),
  telemetry_schema_version smallint not null check (telemetry_schema_version >= 1),
  app_build                text check (length(app_build) <= 100),
  catalog_version          text not null check (length(catalog_version) <= 64),
  policy_id                text not null check (length(policy_id) <= 64),
  policy_version           text not null check (length(policy_version) <= 32),
  experiment_id            text not null check (length(experiment_id) <= 64),
  experiment_arm           text not null check (length(experiment_arm) <= 64),
  assignment_probability   double precision not null check (assignment_probability > 0 and assignment_probability <= 1),
  locale                   text check (length(locale) <= 35),
  time_zone                text check (length(time_zone) <= 64),
  utc_offset_minutes       smallint check (utc_offset_minutes between -900 and 900),
  display_mode             text check (display_mode in ('standalone', 'browser')),
  flags                    jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(flags) = 'object' and pg_column_size(flags) < 4096),
  is_test                  boolean not null default false
);

create index play_sessions_device_idx  on public.play_sessions (device_id, started_at);
create index play_sessions_started_idx on public.play_sessions (started_at desc) where not is_test;
create index play_sessions_policy_idx  on public.play_sessions (policy_id, policy_version, experiment_id);

comment on table public.play_sessions is
  'One row per session that reached the deck. A session is a page load; there is no reliable end, so none is recorded.';

/* ------------------------------------------------------------- context --- */

create table public.context_snapshots (
  snapshot_id              uuid primary key,
  session_id               uuid not null,
  device_id                uuid not null,
  seq                      integer not null check (seq >= 0),
  captured_at              timestamptz not null,
  received_at              timestamptz not null default now(),
  reason                   text not null check (length(reason) <= 32),
  telemetry_schema_version smallint not null check (telemetry_schema_version >= 1),
  context_schema_version   smallint not null check (context_schema_version >= 1),
  base_enabled             boolean not null,
  enabled_categories       text[] not null default '{}',
  consented_categories     text[] not null default '{}',
  pool_size                integer not null check (pool_size >= 0),
  -- Future context. Null always means "unknown", never a default.
  group_size               smallint check (group_size between 1 and 100),
  relationship             text check (length(relationship) <= 32),
  spice_ceiling            text check (length(spice_ceiling) <= 32),
  -- Dimensions not yet promoted to columns. Scalar values, snake_case keys.
  dimensions               jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(dimensions) = 'object' and pg_column_size(dimensions) < 4096),
  is_test                  boolean not null default false,
  unique (session_id, seq)
);

create index context_snapshots_session_idx on public.context_snapshots (session_id, seq);

/* ---------------------------------------------------------- impressions --- */

create table public.card_impressions (
  impression_id            uuid primary key,
  session_id               uuid not null,
  device_id                uuid not null,
  snapshot_id              uuid,
  display_seq              integer not null check (display_seq >= 1),
  card_position            integer not null check (card_position >= 1),
  display_kind             text not null check (display_kind in ('draw', 'revisit', 'redisplay')),
  draw_impression_id       uuid,
  question_id              text not null check (length(question_id) <= 32),
  revision_id              text not null check (length(revision_id) <= 48),
  category                 text check (length(category) <= 64),
  source                   text not null check (length(source) <= 32),
  kind                     text not null check (kind in ('question', 'challenge')),
  policy_id                text check (length(policy_id) <= 64),
  policy_version           text check (length(policy_version) <= 32),
  selection_probability    double precision check (selection_probability > 0 and selection_probability <= 1),
  candidate_count          integer check (candidate_count >= 1),
  arc_phase                text check (length(arc_phase) <= 64),
  shown_at                 timestamptz not null,
  page_visible_at_show     boolean not null,
  received_at              timestamptz not null default now(),
  telemetry_schema_version smallint not null check (telemetry_schema_version >= 1),
  is_test                  boolean not null default false,
  unique (session_id, display_seq),
  -- Only a draw is a policy decision; only a draw carries its probability.
  constraint draws_carry_probability check (
    (display_kind = 'draw') = (draw_impression_id is null)
    and (display_kind = 'draw' or (selection_probability is null and candidate_count is null))
  )
);

create index card_impressions_session_idx  on public.card_impressions (session_id, display_seq);
create index card_impressions_question_idx on public.card_impressions (question_id, shown_at) where not is_test;
create index card_impressions_revision_idx on public.card_impressions (revision_id) where not is_test;
create index card_impressions_shown_idx    on public.card_impressions (shown_at desc);

create table public.card_visibility_events (
  event_id                 uuid primary key,
  impression_id            uuid not null,
  session_id               uuid not null,
  device_id                uuid not null,
  seq                      integer not null check (seq >= 1),
  state                    text not null check (state in ('hidden', 'visible', 'obscured', 'unobscured')),
  occurred_at              timestamptz not null,
  visible_ms               integer not null check (visible_ms >= 0),
  obscured_ms              integer not null check (obscured_ms >= 0),
  hidden_ms                integer not null check (hidden_ms >= 0),
  received_at              timestamptz not null default now(),
  telemetry_schema_version smallint not null check (telemetry_schema_version >= 1),
  is_test                  boolean not null default false,
  unique (impression_id, seq)
);

create table public.card_exits (
  impression_id            uuid primary key,
  session_id               uuid not null,
  device_id                uuid not null,
  exit_action              text not null references public.exit_actions (exit_action),
  dismissed_at             timestamptz not null,
  visible_ms               integer not null check (visible_ms >= 0),
  obscured_ms              integer not null check (obscured_ms >= 0 and obscured_ms <= visible_ms),
  hidden_ms                integer not null check (hidden_ms >= 0),
  elapsed_ms               integer not null check (elapsed_ms >= 0),
  received_at              timestamptz not null default now(),
  telemetry_schema_version smallint not null check (telemetry_schema_version >= 1),
  is_test                  boolean not null default false
);

create index card_exits_session_idx on public.card_exits (session_id);

/* ------------------------------------------------------------- outcomes --- */

create table public.impression_feedback (
  feedback_id              uuid primary key,
  impression_id            uuid not null,
  session_id               uuid not null,
  device_id                uuid not null,
  question_id              text not null check (length(question_id) <= 32),
  revision_id              text not null check (length(revision_id) <= 48),
  kind                     text not null check (kind in ('thumb')),
  value                    text not null check (length(value) <= 32),
  occurred_at              timestamptz not null,
  received_at              timestamptz not null default now(),
  telemetry_schema_version smallint not null check (telemetry_schema_version >= 1),
  is_test                  boolean not null default false,
  constraint thumb_values check (kind <> 'thumb' or value in ('up', 'down'))
);

create index impression_feedback_impression_idx on public.impression_feedback (impression_id);
create index impression_feedback_question_idx   on public.impression_feedback (question_id) where not is_test;

create table public.conversation_nominations (
  event_id                 uuid primary key,
  session_id               uuid not null,
  device_id                uuid not null,
  seq                      integer not null check (seq >= 1),
  action                   text not null check (action in ('nominate', 'clear')),
  impression_id            uuid,
  question_id              text check (length(question_id) <= 32),
  revision_id              text check (length(revision_id) <= 48),
  card_position            integer check (card_position >= 1),
  occurred_at              timestamptz not null,
  received_at              timestamptz not null default now(),
  telemetry_schema_version smallint not null check (telemetry_schema_version >= 1),
  is_test                  boolean not null default false,
  unique (session_id, seq),
  constraint nominations_name_a_card check (
    (action = 'nominate') = (impression_id is not null and question_id is not null
                             and revision_id is not null and card_position is not null)
  )
);

create index conversation_nominations_session_idx on public.conversation_nominations (session_id, seq desc);

comment on table public.conversation_nominations is
  'Append-only nominate/clear events. At most one nomination is in effect per session: the latest event by seq.';

/* ------------------------------------------------------- append-only --- */

create trigger play_sessions_append_only            before update or delete on public.play_sessions            for each row execute function public.reject_mutation();
create trigger context_snapshots_append_only        before update or delete on public.context_snapshots        for each row execute function public.reject_mutation();
create trigger card_impressions_append_only         before update or delete on public.card_impressions         for each row execute function public.reject_mutation();
create trigger card_visibility_events_append_only   before update or delete on public.card_visibility_events   for each row execute function public.reject_mutation();
create trigger card_exits_append_only               before update or delete on public.card_exits               for each row execute function public.reject_mutation();
create trigger impression_feedback_append_only      before update or delete on public.impression_feedback      for each row execute function public.reject_mutation();
create trigger conversation_nominations_append_only before update or delete on public.conversation_nominations for each row execute function public.reject_mutation();

/* ---------------------------------------------------------------- rls --- */

alter table public.exit_actions             enable row level security;
alter table public.play_sessions            enable row level security;
alter table public.context_snapshots        enable row level security;
alter table public.card_impressions         enable row level security;
alter table public.card_visibility_events   enable row level security;
alter table public.card_exits               enable row level security;
alter table public.impression_feedback      enable row level security;
alter table public.conversation_nominations enable row level security;

create policy "admins read exit actions" on public.exit_actions for select to authenticated using (public.is_admin());

create policy "app records sessions"      on public.play_sessions            for insert to anon, authenticated with check (true);
create policy "app records context"       on public.context_snapshots        for insert to anon, authenticated with check (true);
create policy "app records impressions"   on public.card_impressions         for insert to anon, authenticated with check (true);
create policy "app records visibility"    on public.card_visibility_events   for insert to anon, authenticated with check (true);
create policy "app records exits"         on public.card_exits               for insert to anon, authenticated with check (true);
create policy "app records feedback"      on public.impression_feedback      for insert to anon, authenticated with check (true);
create policy "app records nominations"   on public.conversation_nominations for insert to anon, authenticated with check (true);

create policy "admins read sessions"      on public.play_sessions            for select to authenticated using (public.is_admin());
create policy "admins read context"       on public.context_snapshots        for select to authenticated using (public.is_admin());
create policy "admins read impressions"   on public.card_impressions         for select to authenticated using (public.is_admin());
create policy "admins read visibility"    on public.card_visibility_events   for select to authenticated using (public.is_admin());
create policy "admins read exits"         on public.card_exits               for select to authenticated using (public.is_admin());
create policy "admins read feedback"      on public.impression_feedback      for select to authenticated using (public.is_admin());
create policy "admins read nominations"   on public.conversation_nominations for select to authenticated using (public.is_admin());
