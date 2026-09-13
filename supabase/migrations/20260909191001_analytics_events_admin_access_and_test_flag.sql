-- Recorded from supabase_migrations.schema_migrations on 2026-09-13.
-- Already applied to QB Production; committed so the repo holds the full history.

-- The Question Bowl analytics layer.
--
-- Three additions, no redesign of what already exists:
--   1. analytics_events — one generic, append-only event stream. Traffic
--      metrics are derived from it. `props jsonb` is the extension point:
--      a new metric means a new event name and/or new keys in props, never
--      a new column and never a migration.
--   2. visitor_id / session_id / is_test on the two existing tables, so a
--      rating or suggestion can be tied back to a session and excluded when
--      it came from an admin in test mode. All nullable/defaulted, so the
--      rows already in these tables stay valid and simply read as
--      "pre-analytics" (null ids, is_test false).
--   3. Admin read access. The app's anon key stays insert-only on every
--      table; SELECT is granted solely to signed-in users whose email is
--      listed in admin_emails.

/* ------------------------------------------------------------- events --- */

create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  -- Random per-device id kept in localStorage. Not a login, not derived from
  -- anything about the person or their device — just a number, so "unique
  -- visitors" is countable without identifying anyone.
  visitor_id  uuid not null,
  -- New per page load.
  session_id  uuid not null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  is_test     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.analytics_events is
  'Append-only event stream. Add new metrics as new `name` values / `props` keys, not new columns.';

/* ------------------------------------- columns on the existing tables --- */

alter table public.question_ratings
  add column if not exists visitor_id uuid,
  add column if not exists session_id uuid,
  add column if not exists is_test    boolean not null default false;

alter table public.question_suggestions
  add column if not exists visitor_id uuid,
  add column if not exists session_id uuid,
  add column if not exists is_test    boolean not null default false;

/* ------------------------------------------------------------ indexes --- */

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (name, created_at desc) where is_test = false;
create index if not exists analytics_events_visitor_idx
  on public.analytics_events (visitor_id) where is_test = false;
create index if not exists analytics_events_session_idx
  on public.analytics_events (session_id);
create index if not exists question_ratings_question_idx
  on public.question_ratings (question_text) where is_test = false;
create index if not exists question_ratings_created_idx
  on public.question_ratings (created_at desc);
create index if not exists question_suggestions_created_idx
  on public.question_suggestions (created_at desc);

/* -------------------------------------------------------------- admin --- */

create table if not exists public.admin_emails (
  email      text primary key check (length(trim(email)) > 0),
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.admin_emails is
  'Allow-list for dashboard access. An email here can read analytics once a Supabase Auth user exists for it.';

alter table public.admin_emails enable row level security;
-- No policies at all: unreachable to anon and to signed-in non-admins alike.
-- is_admin() below is SECURITY DEFINER, so it reads this table regardless.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_emails a
    where lower(a.email) = lower(nullif(auth.jwt() ->> 'email', ''))
  );
$$;

comment on function public.is_admin() is
  'True when the caller is a signed-in user whose email is in admin_emails. Anon is always false.';

/* ---------------------------------------------------------------- rls --- */

alter table public.analytics_events enable row level security;

drop policy if exists "anyone can record an event" on public.analytics_events;
create policy "anyone can record an event"
  on public.analytics_events for insert to anon, authenticated with check (true);

drop policy if exists "admins can read events" on public.analytics_events;
create policy "admins can read events"
  on public.analytics_events for select to authenticated using (public.is_admin());

drop policy if exists "admins can read ratings" on public.question_ratings;
create policy "admins can read ratings"
  on public.question_ratings for select to authenticated using (public.is_admin());

drop policy if exists "admins can read suggestions" on public.question_suggestions;
create policy "admins can read suggestions"
  on public.question_suggestions for select to authenticated using (public.is_admin());

-- The existing insert policies were granted to `anon` only; once an admin
-- signs in the client is `authenticated`, and would silently stop being able
-- to rate or suggest. Widen them to both roles.
drop policy if exists "anyone can submit a rating" on public.question_ratings;
create policy "anyone can submit a rating"
  on public.question_ratings for insert to anon, authenticated with check (true);

drop policy if exists "anyone can submit a suggestion" on public.question_suggestions;
create policy "anyone can submit a suggestion"
  on public.question_suggestions for insert to anon, authenticated with check (true);
