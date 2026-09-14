-- Recorded from supabase_migrations.schema_migrations on 2026-09-13.
-- Already applied to QB Production; committed so the repo holds the full history.

-- Ratings used to key on question_text, which meant rewording a question
-- silently orphaned everything it had ever collected. They key on a stable
-- id now. question_text stays: it is the wording as it stood at the moment
-- someone rated it, which is historical data and worth keeping — but it is a
-- label from here on, not the identity.
alter table public.question_ratings
  add column if not exists question_id text;

create index if not exists question_ratings_question_id_idx
  on public.question_ratings (question_id) where is_test = false;

comment on column public.question_ratings.question_id is
  'Stable id from src/questions.ts. Survives rewording and moving between packs; join on this, never on question_text.';
comment on column public.question_ratings.question_text is
  'The wording at the time of the rating. Historical snapshot, not a key.';
