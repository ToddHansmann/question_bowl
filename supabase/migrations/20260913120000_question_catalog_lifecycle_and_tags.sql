-- Question catalog, revisions, lifecycle and tags.
--
-- The permanent identity layer everything else joins to. See
-- docs/schema.md and docs/adr/0002-question-identity-and-revisions.md.
--
--   question_catalog            one row per permanent question id
--   question_revisions          one row per distinct wording (id derived from the text)
--   lifecycle_statuses          draft / experimental / canon / archived
--   lifecycle_transitions       the allowed moves between them
--   question_lifecycle_events   append-only: every status change, who, why
--   tag_dimensions, tag_values  the editorial tag scheme
--   question_tag_assignments    append-only: every tag decision, per revision
--   submission_reviews          append-only: every editorial decision on a submission
--
-- Nothing here is writable by the anon key. Admins read through RLS and
-- write only through the SECURITY DEFINER functions in
-- 20260913120200_editorial_workflow.sql.
--
-- Purely additive except for one widened CHECK on question_ratings.source.

/* ------------------------------------------------------------ catalog --- */

create table public.question_catalog (
  question_id   text primary key
                check (question_id ~ '^[a-z]+-[0-9]+$'),
  origin        text not null check (origin in ('original', 'todd', 'community')),
  submission_id uuid references public.question_suggestions (id),
  -- Latest known placement. Placement is not identity and not wording:
  -- moving a question between packs changes neither its id nor its
  -- revision. The placement at the moment a card was shown is recorded on
  -- the impression itself, which is the historical record.
  category      text,
  kind          text not null default 'question' check (kind in ('question', 'challenge')),
  created_at    timestamptz not null default now(),
  constraint community_questions_come_from_a_submission
    check ((origin = 'community') = (submission_id is not null))
);

comment on table public.question_catalog is
  'Every question id that has ever existed. Ids are permanent and never reused. Wording lives in question_revisions; status in question_lifecycle_events.';

create table public.question_revisions (
  revision_id  text primary key,
  question_id  text not null references public.question_catalog (question_id),
  text         text not null check (length(text) between 1 and 1000),
  recorded_by  text not null,
  recorded_at  timestamptz not null default now(),
  -- Identical to revisionIdFor() in src/catalog/revision.ts. A revision
  -- whose id does not match its exact wording cannot exist.
  constraint revision_id_matches_text check (
    revision_id = question_id || '@' ||
      left(encode(sha256(convert_to(normalize(text, NFC), 'UTF8')), 'hex'), 12)
  )
);

create index question_revisions_question_idx on public.question_revisions (question_id, recorded_at);

comment on table public.question_revisions is
  'One row per distinct wording of a question. revision_id = question_id@sha256(NFC(text))[0:12]. Edits create rows; rows are never changed.';

/* ---------------------------------------------------------- lifecycle --- */

create table public.lifecycle_statuses (
  status      text primary key,
  position    smallint not null unique,
  dealt       text not null check (dealt in ('never', 'when_experimental_enabled', 'always')),
  description text not null
);

insert into public.lifecycle_statuses (status, position, dealt, description) values
  ('draft',        0, 'never',                     'Accepted for consideration. Has a permanent id. Lives only in the database.'),
  ('experimental', 1, 'when_experimental_enabled', 'Being tested with real tables. Ships in questions.ts.'),
  ('canon',        2, 'always',                    'Part of the game.'),
  ('archived',     3, 'never',                     'Out of play. Never deleted; history stays attached.');

create table public.lifecycle_transitions (
  from_status text not null references public.lifecycle_statuses (status),
  to_status   text not null references public.lifecycle_statuses (status),
  primary key (from_status, to_status),
  check (from_status <> to_status)
);

-- Mirrors LIFECYCLE_TRANSITIONS in src/catalog/lifecycle.ts (a test holds them equal).
insert into public.lifecycle_transitions (from_status, to_status) values
  ('draft',        'experimental'),
  ('draft',        'archived'),
  ('experimental', 'canon'),
  ('experimental', 'archived'),
  ('canon',        'archived'),
  ('archived',     'experimental');

create table public.question_lifecycle_events (
  event_id    bigint generated always as identity primary key,
  question_id text not null references public.question_catalog (question_id),
  from_status text references public.lifecycle_statuses (status),
  to_status   text not null references public.lifecycle_statuses (status),
  reason      text not null check (length(trim(reason)) > 0),
  actor       text not null check (length(trim(actor)) > 0),
  occurred_at timestamptz not null default now()
);

create index question_lifecycle_events_question_idx
  on public.question_lifecycle_events (question_id, event_id desc);

comment on table public.question_lifecycle_events is
  'Append-only. Every status change a question has ever had, with the person and the reason. Current status = latest event. Promotion is always editorial.';

/*
 * Enforces the lifecycle on every insert, whoever inserts:
 * - the first event of a community question must be `draft`;
 * - the first event of an editor-authored question may be anything but `draft`;
 * - every later event must start from the current status and follow an
 *   allowed transition.
 * Locks the catalog row so two editors can't race a question into two states.
 */
create function public.enforce_lifecycle_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_origin  text;
  v_current text;
begin
  select origin into v_origin
  from public.question_catalog
  where question_id = new.question_id
  for update;

  select to_status into v_current
  from public.question_lifecycle_events
  where question_id = new.question_id
  order by event_id desc
  limit 1;

  if v_current is null then
    if new.from_status is not null then
      raise exception 'lifecycle: % has no status yet; from_status must be null', new.question_id;
    end if;
    if v_origin = 'community' and new.to_status <> 'draft' then
      raise exception 'lifecycle: community question % must start as draft', new.question_id;
    end if;
    if v_origin <> 'community' and new.to_status = 'draft' then
      raise exception 'lifecycle: editor-authored question % cannot be a draft', new.question_id;
    end if;
    return new;
  end if;

  if new.from_status is distinct from v_current then
    raise exception 'lifecycle: % is %, not %', new.question_id, v_current, coalesce(new.from_status, 'null');
  end if;

  if not exists (
    select 1 from public.lifecycle_transitions t
    where t.from_status = v_current and t.to_status = new.to_status
  ) then
    raise exception 'lifecycle: % cannot move from % to %', new.question_id, v_current, new.to_status;
  end if;

  return new;
end;
$$;

create trigger question_lifecycle_events_enforce
  before insert on public.question_lifecycle_events
  for each row execute function public.enforce_lifecycle_transition();

-- Append-only means append-only.
create function public.reject_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger question_lifecycle_events_append_only
  before update or delete on public.question_lifecycle_events
  for each row execute function public.reject_mutation();

create trigger question_revisions_append_only
  before update or delete on public.question_revisions
  for each row execute function public.reject_mutation();

create view public.question_current_status
with (security_invoker = true) as
  select distinct on (e.question_id)
    e.question_id,
    e.to_status  as status,
    e.reason,
    e.actor,
    e.occurred_at as since
  from public.question_lifecycle_events e
  order by e.question_id, e.event_id desc;

/* --------------------------------------------------------------- tags --- */

create table public.tag_dimensions (
  dimension            text primary key check (dimension ~ '^[a-z][a-z_]*$'),
  kind                 text not null check (kind in ('ordinal', 'enum', 'set')),
  label                text not null,
  description          text not null,
  introduced_in_scheme smallint not null check (introduced_in_scheme >= 1)
);

create table public.tag_values (
  dimension            text not null references public.tag_dimensions (dimension),
  value                text not null check (value ~ '^[a-z][a-z_]*$'),
  position             smallint not null,
  label                text not null,
  deprecated           boolean not null default false,
  introduced_in_scheme smallint not null check (introduced_in_scheme >= 1),
  primary key (dimension, value)
);

create table public.question_tag_assignments (
  assignment_id  bigint generated always as identity primary key,
  revision_id    text not null references public.question_revisions (revision_id),
  dimension      text not null references public.tag_dimensions (dimension),
  -- Value keys, never ranks. Empty array = the dimension was cleared.
  tag_values     text[] not null,
  scheme_version smallint not null check (scheme_version >= 1),
  source         text not null check (source in ('catalog_sync', 'admin')),
  assigned_by    text not null,
  assigned_at    timestamptz not null default now()
);

create index question_tag_assignments_revision_idx
  on public.question_tag_assignments (revision_id, dimension, assignment_id desc);

comment on table public.question_tag_assignments is
  'Append-only. Manual editorial tags per revision. Never generated or inferred. Current tags = latest assignment per (revision, dimension).';

create function public.enforce_tag_assignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_bad  text;
begin
  select kind into v_kind from public.tag_dimensions where dimension = new.dimension;
  if v_kind <> 'set' and cardinality(new.tag_values) > 1 then
    raise exception 'tags: % takes one value, got %', new.dimension, new.tag_values;
  end if;
  if cardinality(new.tag_values) <> (select count(distinct v) from unnest(new.tag_values) v) then
    raise exception 'tags: % repeats a value', new.dimension;
  end if;
  select v into v_bad
  from unnest(new.tag_values) v
  where not exists (
    select 1 from public.tag_values t where t.dimension = new.dimension and t.value = v
  )
  limit 1;
  if v_bad is not null then
    raise exception 'tags: % is not a value of %', v_bad, new.dimension;
  end if;
  return new;
end;
$$;

create trigger question_tag_assignments_enforce
  before insert on public.question_tag_assignments
  for each row execute function public.enforce_tag_assignment();

create trigger question_tag_assignments_append_only
  before update or delete on public.question_tag_assignments
  for each row execute function public.reject_mutation();

create view public.question_current_tags
with (security_invoker = true) as
  select distinct on (a.revision_id, a.dimension)
    a.revision_id,
    r.question_id,
    a.dimension,
    a.tag_values,
    a.scheme_version,
    a.assigned_by,
    a.assigned_at
  from public.question_tag_assignments a
  join public.question_revisions r using (revision_id)
  order by a.revision_id, a.dimension, a.assignment_id desc;

/* -------------------------------------------------------- submissions --- */

create sequence public.community_question_number;

create table public.submission_reviews (
  review_id     bigint generated always as identity primary key,
  submission_id uuid not null references public.question_suggestions (id),
  decision      text not null check (decision in ('accepted', 'declined', 'duplicate')),
  -- accepted: the draft this became. duplicate: the existing question it repeats.
  question_id   text references public.question_catalog (question_id),
  note          text,
  reviewer      text not null check (length(trim(reviewer)) > 0),
  reviewed_at   timestamptz not null default now(),
  constraint decision_names_its_question check (
    (decision = 'declined') or (question_id is not null)
  )
);

create index submission_reviews_submission_idx on public.submission_reviews (submission_id, review_id desc);

create trigger submission_reviews_append_only
  before update or delete on public.submission_reviews
  for each row execute function public.reject_mutation();

comment on table public.submission_reviews is
  'Append-only. Every editorial decision on a community submission. question_suggestions stays the untouched raw submission.';

/* ------------------------------------------ ratings may be community --- */

do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.question_ratings'::regclass
      and c.contype = 'c'
      and a.attname = 'source'
  loop
    execute format('alter table public.question_ratings drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.question_ratings
  add constraint question_ratings_source_check
  check (source in ('original', 'todd', 'community'));

/* ---------------------------------------------------------------- rls --- */

alter table public.question_catalog          enable row level security;
alter table public.question_revisions        enable row level security;
alter table public.lifecycle_statuses        enable row level security;
alter table public.lifecycle_transitions     enable row level security;
alter table public.question_lifecycle_events enable row level security;
alter table public.tag_dimensions            enable row level security;
alter table public.tag_values                enable row level security;
alter table public.question_tag_assignments  enable row level security;
alter table public.submission_reviews        enable row level security;

create policy "admins read catalog"     on public.question_catalog          for select to authenticated using (public.is_admin());
create policy "admins read revisions"   on public.question_revisions        for select to authenticated using (public.is_admin());
create policy "admins read statuses"    on public.lifecycle_statuses        for select to authenticated using (public.is_admin());
create policy "admins read transitions" on public.lifecycle_transitions     for select to authenticated using (public.is_admin());
create policy "admins read lifecycle"   on public.question_lifecycle_events for select to authenticated using (public.is_admin());
create policy "admins read dimensions"  on public.tag_dimensions            for select to authenticated using (public.is_admin());
create policy "admins read tag values"  on public.tag_values                for select to authenticated using (public.is_admin());
create policy "admins read tags"        on public.question_tag_assignments  for select to authenticated using (public.is_admin());
create policy "admins read reviews"     on public.submission_reviews        for select to authenticated using (public.is_admin());

-- No insert/update/delete policies: writes happen only inside SECURITY
-- DEFINER functions, which check is_admin() themselves.

revoke all on public.question_current_status from anon;
revoke all on public.question_current_tags   from anon;
revoke all on sequence public.community_question_number from anon, authenticated;
