-- Recorded from supabase_migrations.schema_migrations on 2026-09-13.
-- Already applied to QB Production; committed so the repo holds the full history.

-- One row per thumbs-up/down a visitor gives a question.
create table if not exists public.question_ratings (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  category text,              -- null for a Base Question
  source text not null check (source in ('original', 'todd')),
  value text not null check (value in ('up', 'down')),
  created_at timestamptz not null default now()
);

create index if not exists question_ratings_question_text_idx
  on public.question_ratings (question_text);

alter table public.question_ratings enable row level security;

-- The app can only ever write a rating, never read one back.
create policy "anyone can submit a rating"
  on public.question_ratings
  for insert
  to anon
  with check (true);

-- User-submitted question ideas, for manual editorial review in the Table Editor.
create table if not exists public.question_suggestions (
  id uuid primary key default gen_random_uuid(),
  suggested_text text not null,
  suggested_category text,    -- optional; one of the expansion pack names, or null
  created_at timestamptz not null default now()
);

alter table public.question_suggestions enable row level security;

-- Same one-way shape: the app can submit, never list or read back.
create policy "anyone can submit a suggestion"
  on public.question_suggestions
  for insert
  to anon
  with check (true);
