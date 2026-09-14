# Telemetry specification

**Schema version:** 1 (`TELEMETRY_SCHEMA_VERSION`)
**Status:** Active since 2026-09-13
**Code:** `src/telemetry/` · **Tables:** `supabase/migrations/20260913120100_play_telemetry.sql`

This is the contract between the app and every future recommendation policy.
It describes what is recorded, exactly when, and exactly what each value
means. If code and this document disagree, that is a bug in one of them.

## Principles

1. **The unit of value is a conversation, not a card.** Nothing recorded here
   is a success metric on its own. Cards per session, time in app and votes
   cast are never goals.
2. **Raw events only.** No scores, no aggregates, nothing that can't be
   recomputed. Definitions (like "an inferred exit") live in views.
3. **Append-only.** Rows are never updated or deleted.
4. **Every draw logs its exact selection probability.**
5. **Measured meaning never changes silently.** A change to *how* a field is
   measured bumps `TELEMETRY_SCHEMA_VERSION`.

## Identity and privacy

| Field | Meaning |
|---|---|
| `device_id` | Random UUID in this browser's localStorage (`qb.visitor.v1`), shared with `analytics_events.visitor_id`. Says "the same browser came back", nothing more. |
| `session_id` | Random UUID per page load, shared with `analytics_events.session_id`. |
| `is_test` | True in test mode (admin sign-in, `?qbtest=1`). |

Not collected: accounts, names, emails, IP-derived data, fingerprints,
precise location, answers, audio. `locale`, `time_zone` and `utc_offset_minutes`
are coarse and recorded once per session. **Excluded devices** (the admin
toggle) record nothing. **Non-production hosts** (local dev, Vercel previews)
send nothing; rows are discarded by the outbox.

**`device_id` is a browser, not a group or a person**, and it isn't always
even the same browser for long: Safari's tracking prevention can clear
script-written storage — `device_id` included — after roughly a week without
a visit (a page added to the home screen is exempt). Any "return" outcome
built on `device_id` (strategy.md §10, Q3) will undercount returning iPhone
Safari players who don't re-add the shortcut, and should account for that —
a shorter window, or treating iOS Safari separately — before it's finalized.

## Lifecycle of a session

```
landing ── tap ──► [welcome, first time only] ──► deck appears
                                                    │
                                     play_sessions  ◄┤ (once)
                                 context_snapshots  ◄┤ (seq 0, reason session_start)
                                                    │
      ┌──────────────── card on screen ─────────────┤
      │  card_impressions (draw | revisit | redisplay)
      │  card_visibility_events (hidden/visible/obscured/unobscured)*
      │  impression_feedback (thumb)*
      │  conversation_nominations (nominate/clear)*
      │  context_snapshots (pool_changed)*   ← room changed; the open card keeps its snapshot
      └──► card_exits (exactly one: next | back | skip | reroll | pool_emptied | background | session_abandoned | superseded)
```

There is **no session end**. The last impression's `shown_at`, or its exit,
is as close as the data gets.

## Tables and fields

Every row also carries `session_id`, `device_id`, `is_test`,
`telemetry_schema_version`, and server-side `received_at`.

### `play_sessions`: when the deck first appears

| Field | Meaning |
|---|---|
| `started_at` | Client wall clock when the deck mounted. |
| `app_build` | `VITE_APP_BUILD` if set (e.g. a commit sha), else null. |
| `catalog_version` | Hash of every dealt revision id in this build (`CATALOG_VERSION`). Reconstructs the candidate universe. |
| `policy_id`, `policy_version` | The policy this session plays under. Today `uniform_random` / `1`. |
| `experiment_id`, `experiment_arm`, `assignment_probability` | Assignment. Today `baseline` / `uniform_random` / `1`. |
| `locale`, `time_zone`, `utc_offset_minutes` | Coarse, from the browser. |
| `display_mode` | `standalone` (home-screen app) or `browser`. |
| `flags` | Every resolved feature flag for this session. |

### `context_snapshots`: the room

Written at session start and whenever the room changes (a pack switched,
consent given). An identical room produces no new row.

| Field | Meaning |
|---|---|
| `snapshot_id`, `seq` | Identity; `seq` starts at 0 per session. |
| `captured_at`, `reason` | `session_start`, `pool_changed`, `context_changed`. |
| `context_schema_version` | Version of the snapshot shape (1). |
| `base_enabled`, `enabled_categories`, `consented_categories` | The pool as configured. Categories sorted. |
| `pool_size` | Number of dealable questions in that configuration. |
| `group_size`, `relationship`, `spice_ceiling` | **Reserved; always null today.** Null means *unknown*, never a default. |
| `dimensions` | jsonb for future dimensions before promotion to columns. `{}` today. |

### `card_impressions`: a card appeared

| Field | Meaning |
|---|---|
| `impression_id` | Client UUID. |
| `snapshot_id` | Context current when the card was **shown**. For a draw, that is the context it was selected under. |
| `display_seq` | 1, 2, 3… every display this session, including revisits. |
| `card_position` | 1-based position in the session's history. A revisit repeats its position. |
| `display_kind` | `draw`: the policy chose it now. `revisit`: navigated back or forward to it. `redisplay`: re-shown after the pool was emptied or the page was restored from the back/forward cache. |
| `draw_impression_id` | For revisit and redisplay, the impression that originally drew this position. Null for draws. |
| `question_id`, `revision_id` | Permanent id and exact wording (ADR 0002). |
| `category`, `source`, `kind` | Placement and provenance **at display time**. |
| `policy_id`, `policy_version` | The policy that drew this position. |
| `selection_probability` | **Draws only.** The exact probability the policy gave this card. Null for revisit and redisplay. |
| `candidate_count` | **Draws only.** Size of the eligible set. |
| `arc_phase` | Reserved; null until an arc exists. |
| `shown_at` | Client wall clock. |
| `page_visible_at_show` | False if the card was dealt while the page was hidden. |

### `card_visibility_events`: while a card was up

| `state` | When |
|---|---|
| `hidden` | `visibilitychange` → hidden (tab switched, app backgrounded, screen locked). Sent **urgently**. |
| `visible` | Page visible again. |
| `obscured` | The menu opened over the card. |
| `unobscured` | The menu closed. |

Each row carries the card's cumulative `visible_ms`, `obscured_ms` and
`hidden_ms` at that moment, so a page that dies afterwards still leaves a
usable dwell reading.

### `card_exits`: a card left the screen

At most one per impression (primary key `impression_id`).

| Field | Meaning |
|---|---|
| `exit_action` | See below. |
| `dismissed_at` | Client wall clock. |
| `visible_ms` | Milliseconds the page was visible while this card was current. Paused while hidden, resumed on return. Includes obscured time. |
| `obscured_ms` | The part of `visible_ms` with the menu over the card. `obscured_ms ≤ visible_ms`. |
| `hidden_ms` | Milliseconds the page was hidden while this card was current. May under-count long backgrounds on platforms that freeze the monotonic clock; use the wall timestamps for real elapsed time. |
| `elapsed_ms` | Monotonic milliseconds from show to exit. |

All durations are integer milliseconds, measured with `performance.now()`.

#### Exit actions

| Action | Emitted when | Emitted today? |
|---|---|---|
| `next` | Swipe left, ←, Space or Enter (forward, including forward through history). | Yes |
| `back` | Swipe right or → to the previous card. | Yes |
| `skip` | An explicit pass. Swipe up when `skipGesture` is on. | Off by default |
| `reroll` | Replace the card without advancing. | No control yet |
| `pool_emptied` | Every pack switched off, so the card disappears. | Yes |
| `background` | `pagehide` fires while the page is already hidden. | Yes |
| `session_abandoned` | `pagehide` fires while the page is visible (tab closed, navigated away). | Yes |
| `superseded` | A new card was shown without the old one closing. **A bug indicator; should be zero.** | Never intentionally |

Exit actions live in the `exit_actions` lookup table, so adding one is an
INSERT plus a TypeScript change. A test keeps the two lists identical.

**Pages that die without `pagehide`** (iOS often kills backgrounded pages
silently) leave an impression with no exit. `research_impressions` infers:

- last visibility event `hidden` → `background`, `exit_source = inferred_from_visibility`
- otherwise → `session_abandoned`, `exit_source = inferred_no_signal`

An impression from a session still in progress also reads as inferred until
its exit arrives.

### `impression_feedback`

One row per thumbs up/down, tied to the exact impression and revision.
`kind = 'thumb'`, `value ∈ {up, down}`. The legacy `question_ratings` row is
still written by the same tap. A device can rate a question once (unchanged
behavior).

### `conversation_nominations`

| Field | Meaning |
|---|---|
| `seq` | 1, 2, 3… per session. The latest event is in effect. |
| `action` | `nominate` (names a card) or `clear` (withdraws). |
| `impression_id`, `question_id`, `revision_id`, `card_position` | Required for `nominate`; null for `clear`. |

One nomination is in effect per session at most. Nominating a different card
replaces it; re-nominating the same card (even on a revisit) is a no-op.

## Delivery

See ADR 0008. In short: client-generated primary keys; an outbox that retries
transient failures with backoff, persists to localStorage (1,000 rows, 14
days), treats 409 as delivered, isolates and drops permanently rejected rows,
and flushes with `keepalive` on hide and `pagehide`.

## Verifying telemetry locally

```
http://localhost:5173/?qbflags=telemetryDebug
```

Every row is logged to the console and appended to `window.__sttTelemetry`.
Local dev never writes to Supabase. `?qbflags=-telemetryDebug` turns it off
again.

## What is deliberately not recorded

- What anyone said. Ever.
- Scroll, tap coordinates, gesture velocity, or any interaction telemetry
  beyond the exit action.
- Derived "engagement" or "quality" scores.
- Anything from excluded devices or non-production hosts.

## Changing this spec

1. Additive nullable field: migration first, deploy migration, then client.
   Update this document in the same change.
2. New exit action, display kind or context reason: add it (lookup insert or
   CHECK change plus TypeScript), and document it here.
3. Changed measurement: bump `TELEMETRY_SCHEMA_VERSION` and add a
   "Version history" entry below.

## Version history

| Version | Date | Change |
|---|---|---|
| 1 | 2026-09-13 | Initial specification. |
