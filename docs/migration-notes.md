# Migration notes: recommendation foundation (2026-09-13)

## Summary

| | |
|---|---|
| New migrations | `20260913120000_question_catalog_lifecycle_and_tags` · `20260913120100_play_telemetry` · `20260913120200_editorial_workflow` · `20260913120300_research_views` |
| Recorded history | The 7 migrations already applied to QB Production are now committed in `supabase/migrations/` verbatim (from `supabase_migrations.schema_migrations`). They must **not** be re-applied. |
| Destructive changes | None. No table, column, row or function is dropped. |
| Changed existing object | `question_ratings.source` CHECK widened to allow `community` (dropped and re-added under the name `question_ratings_source_check`). |
| Downtime | None. Every new table starts empty; the one ALTER touches a 7-row table. |
| Validated | `npm run test:db` applies all 11 migrations in order on Postgres (PGlite 0.5.8 / PG 18) with Supabase's roles and default grants, then runs 22 checks. **Not yet applied to QB Production.** |

## Deploy order

The client is written to tolerate the database lagging behind it (a missing
table makes telemetry rows fail with 404, which the outbox drops rather than
retries), but apply the database first so nothing is lost:

1. **Apply the four new migrations** to QB Production, in filename order
   (Supabase SQL editor, `supabase db push`, or the Supabase MCP
   `apply_migration`).
2. **Verify** (SQL editor, as `postgres`):
   ```sql
   select count(*) from public.exit_actions;           -- 8
   select count(*) from public.lifecycle_transitions;  -- 6
   select public.admin_telemetry_health();             -- runs (zeros; postgres isn't in admin_emails)
   ```
3. **Deploy the app** (push to `main` → Vercel).
4. **Sign in to /admin → Catalog → Sync this build.** Expect roughly 430
   questions, 430 wordings and 430 statuses added, with nothing skipped.
5. Play a few cards on the production site in test mode (`?qbtest=1`), then
   check **Data health**: sessions and exits reported should be non-zero, and
   integrity problems should be 0.

## Rollback

- **App:** revert the deploy in Vercel. The previous client never reads or
  writes the new tables, so it's unaffected by them.
- **Database:** the new objects are additive and can stay in place under an
  older client. If they must go, drop in reverse dependency order: the views,
  then the `admin_*` functions added here, then the telemetry tables, then
  the catalog tables and triggers. Restoring the old ratings CHECK would fail
  once any community rating exists; leave it widened.
- **Turning telemetry off without a rollback:** redeploy with
  `VITE_FLAGS=-telemetry`.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PRODUCTION_HOSTNAME` | yes (unchanged) | |
| `VITE_FLAGS` | no | e.g. `experimentalQuestions` or `-onboarding` |
| `VITE_APP_BUILD` | no | Recommended: the commit sha (`VITE_APP_BUILD=$VERCEL_GIT_COMMIT_SHA`) so sessions record the exact build. |

## Player-visible effects of deploying

- A one-time welcome before each device's next game (existing players see it
  once too).
- A new line on the home screen, a star in the top-left of the deck, and an
  About page in the menu.
- Nothing about dealing, swiping, packs, consent, ratings or suggestions
  changes.

## Data continuity

- `question_ratings`, `question_suggestions` and `analytics_events` keep
  receiving exactly what they received before. Every existing dashboard number
  is unaffected.
- Telemetry history begins at deploy. There is no backfill: impressions were
  never recorded before, and inventing them would violate the raw-events
  principle.
- Existing suggestions appear in *Community questions* as undecided.

## Operational notes

- **Append-only enforcement.** Event tables reject UPDATE and DELETE via
  trigger, even for `postgres`. If a row must be removed (a legal request, or
  abusive submitted text in a revision), a superuser disables the trigger for
  that transaction:
  ```sql
  begin;
  alter table public.question_revisions disable trigger question_revisions_append_only;
  -- delete …
  alter table public.question_revisions enable trigger question_revisions_append_only;
  commit;
  ```
  Record the removal and its reason in this file.
- **Keeping the repo history in sync.** Any future migration applied directly
  in Supabase must also be committed to `supabase/migrations/` under the same
  version, or `npm run test:db` no longer describes production.

## Change log

| Date | Change | By |
|---|---|---|
| 2026-09-13 | Recommendation foundation migrations authored and validated on PGlite. | Claude Code session |
