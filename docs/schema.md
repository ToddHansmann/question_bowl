# Database schema

Supabase project **QB Production**. Every migration is in
`supabase/migrations/`, in order, and `npm run test:db` replays all of them
against an in-process Postgres and exercises the result.

## Map

```
                          ┌──────────────────────┐
question_suggestions ───► │ submission_reviews   │ (append-only decisions)
   (raw, untouched)       └──────────┬───────────┘
                                     │ accepted → com-NNNN
                                     ▼
┌──────────────────┐   ┌──────────────────────┐   ┌─────────────────────────────┐
│ question_catalog │◄──│ question_revisions   │◄──│ question_tag_assignments    │
│ (permanent ids)  │   │ (id = hash of text)  │   │ (append-only, per revision) │
└────────┬─────────┘   └──────────────────────┘   └──────────────┬──────────────┘
         │                                                        │
         ▼                                            tag_dimensions / tag_values
question_lifecycle_events ── lifecycle_statuses / lifecycle_transitions
   (append-only)

play_sessions ─┬─ context_snapshots
               ├─ card_impressions ─┬─ card_visibility_events
               │                    ├─ card_exits ── exit_actions
               │                    └─ impression_feedback
               └─ conversation_nominations
          (joined by id; no FKs — see ADR 0008)

Legacy, unchanged: analytics_events · question_ratings · question_suggestions · admin_emails
```

## Access model

| Role | Catalog & editorial | Telemetry | Legacy tables |
|---|---|---|---|
| `anon` (the app) | none | INSERT only | INSERT only (as before) |
| `authenticated`, not admin | none | none | none |
| `authenticated` + in `admin_emails` | SELECT; writes only via `admin_*` functions | SELECT | SELECT (as before) |
| `postgres` / service role | all | all | all |

- RLS is enabled on every table.
- Every view is `security_invoker = true`. Without it a view runs with its
  owner's rights and would bypass RLS.
- Every `admin_*` function is `SECURITY DEFINER`, calls `require_admin()` or
  `is_admin()` first, and is revoked from `public` and `anon`.
- **Append-only** is enforced by a `reject_mutation()` trigger on every event
  table, which blocks UPDATE and DELETE even for the owner. To remove a row
  for a legal or safety reason, a superuser must disable the trigger
  explicitly, and that should be recorded in `docs/migration-notes.md`.

## Catalog and editorial tables

### `question_catalog`
| Column | Type | Notes |
|---|---|---|
| `question_id` | text PK | `^[a-z]+-[0-9]+$`. Permanent. |
| `origin` | text | `original` · `todd` · `community` |
| `submission_id` | uuid → `question_suggestions.id` | Required iff `origin = community`. |
| `category` | text | Latest known placement (mutable; placement at display time is on each impression). |
| `kind` | text | `question` · `challenge` |
| `created_at` | timestamptz | |

### `question_revisions` (append-only)
| Column | Type | Notes |
|---|---|---|
| `revision_id` | text PK | CHECK: `question_id@left(sha256(NFC(text)),12)` |
| `question_id` | text → catalog | |
| `text` | text | 1–1000 chars |
| `recorded_by` | text | `catalog-sync` or an editor's email |
| `recorded_at` | timestamptz | |

### `lifecycle_statuses`, `lifecycle_transitions`
Lookup tables. Statuses: `draft`, `experimental`, `canon`, `archived`.
Transitions: draft→experimental, draft→archived, experimental→canon,
experimental→archived, canon→archived, archived→experimental.

### `question_lifecycle_events` (append-only)
`event_id` identity · `question_id` · `from_status` (null for first) ·
`to_status` · `reason` (required) · `actor` (required) · `occurred_at`.
Trigger `enforce_lifecycle_transition` requires community questions to start
in `draft`, editor-authored ones never to be `draft`, and every later event to
follow an allowed transition from the current status. It locks the catalog row.

View **`question_current_status`**: latest event per question.

### `tag_dimensions`, `tag_values`
Registered from `src/catalog/tags.ts` by catalog sync. Values are never
deleted, only `deprecated`.

### `question_tag_assignments` (append-only)
`assignment_id` · `revision_id` · `dimension` · `tag_values text[]` (value
keys; empty = cleared) · `scheme_version` · `source` (`catalog_sync` | `admin`)
· `assigned_by` · `assigned_at`. Trigger validates values and cardinality.

View **`question_current_tags`**: latest assignment per (revision, dimension).

### `submission_reviews` (append-only)
`review_id` · `submission_id` · `decision` (`accepted` | `declined` |
`duplicate`) · `question_id` (the draft created, or the question duplicated) ·
`note` · `reviewer` · `reviewed_at`.

Sequence **`community_question_number`** allocates `com-0001`, `com-0002`, …

## Telemetry tables

Field-level meaning is in [telemetry-spec.md](telemetry-spec.md). Structural
notes:

| Table | PK | Uniques | Notable constraints |
|---|---|---|---|
| `play_sessions` | `session_id` | | `assignment_probability ∈ (0,1]`; `flags` object < 4KB |
| `context_snapshots` | `snapshot_id` | `(session_id, seq)` | `group_size 1–100`; `dimensions` object < 4KB |
| `card_impressions` | `impression_id` | `(session_id, display_seq)` | `draws_carry_probability`: draw ⇔ no `draw_impression_id`; non-draws have no probability |
| `card_visibility_events` | `event_id` | `(impression_id, seq)` | state ∈ hidden/visible/obscured/unobscured |
| `card_exits` | `impression_id` | | `exit_action` → `exit_actions`; `obscured_ms ≤ visible_ms` |
| `impression_feedback` | `feedback_id` | | thumb ∈ up/down |
| `conversation_nominations` | `event_id` | `(session_id, seq)` | `nominations_name_a_card` |

Indexes favor per-session reads and per-question/revision analysis over
non-test rows.

## Research views

| View | One row per | Notes |
|---|---|---|
| `research_impressions` | impression | Joins exit, infers missing exits (`exit_source`), best-available dwell, thumbs. |
| `research_nominations` | session that ever nominated | Latest nominate/clear; `nominated = false` means withdrawn. |
| `research_sessions` | session | Descriptive counts. **Not a success metric.** |

## Functions

| Function | Caller | Purpose |
|---|---|---|
| `is_admin()` | RLS, functions | Existing. |
| `require_admin()` | functions | Raises unless admin; returns caller email. |
| `admin_sync_catalog(catalog, tag_scheme)` | Dashboard → Catalog | Registers questions, revisions, statuses (editor-authored), tag scheme and tags. Reports community drift and skipped items. Idempotent. |
| `admin_editorial_queue(include_test)` | Dashboard → Community questions | Submissions with latest decision, status, current wording. |
| `admin_review_submission(id, decision, note, text, category, kind, duplicate_of)` | Dashboard | Accept (creates draft), decline, duplicate. |
| `admin_revise_draft(question_id, text, reason)` | Dashboard | New revision for a draft only. |
| `admin_transition_question(question_id, to_status, reason)` | Dashboard | One lifecycle move. |
| `admin_question_statuses()` | Tools | Id → current status. |
| `admin_telemetry_health(include_test)` | Dashboard → Data health | Ingestion integrity counts. |
| Legacy `admin_traffic`, `admin_engagement`, `admin_ratings_by_category`, `admin_ratings_by_question`, `admin_suggestions` | Dashboard | Unchanged. |

## Changes to existing objects

Exactly one: `question_ratings.source` CHECK widened from
`('original','todd')` to `('original','todd','community')`, re-created under
the explicit name `question_ratings_source_check`.
