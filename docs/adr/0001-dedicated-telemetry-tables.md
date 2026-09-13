# 0001 — Dedicated telemetry tables

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

Sip the Tea already has `analytics_events`: an append-only `{ name, props jsonb }`
stream designed so a new metric never needs a migration. It serves traffic
questions well (how many people opened the app, how many started).

The recommendation engine needs something different. Its data is the
permanent research record of which question was shown, to which room, how it
was chosen, how long it stayed up, and how it left. Future policies will be
trained and evaluated on it for years. That data needs:

- typed columns that can be indexed and joined (session → impression → exit),
- constraints that reject malformed rows at write time, not analysis time,
- invariants the database can enforce (a draw carries its probability, a
  revisit doesn't),
- a schema that is itself documentation.

A `props` blob gives none of these. A mistake in a JSON key made today would
go unnoticed until someone tried to train on two years of it.

## Decision

Recommendation telemetry gets its own normalized tables:
`play_sessions`, `context_snapshots`, `card_impressions`,
`card_visibility_events`, `card_exits`, `impression_feedback`,
`conversation_nominations`, plus the `exit_actions` lookup. These tables are
insert-only for the app, select-only for admins, and append-only for everyone.

`analytics_events` stays exactly as it is, for traffic and product events
(`app_opened`, `session_started`, `onboarding_shown`, …).

## Consequences

- Adding a *measured* field requires a migration. That friction is intended:
  it forces a decision about meaning, type and nullability up front.
- Open-ended context is still possible without a migration through
  `context_snapshots.dimensions jsonb`. A dimension that proves itself is later
  promoted to a typed column.
- The existing thumbs up/down write to `question_ratings` is unchanged. The
  same tap also writes `impression_feedback`, which ties the rating to the
  exact impression and revision. Both exist; neither depends on the other.
- Two places record "a session started": `analytics_events` (traffic) and
  `play_sessions` (research). They answer different questions and are allowed
  to disagree slightly. For example, an excluded device is absent from both,
  and a device with the `telemetry` flag off is absent only from
  `play_sessions`.

## Alternatives considered

- **More event names in `analytics_events`.** Rejected: no types, no
  constraints, and no cheap joins at the scale of millions of impressions.
- **A third-party product analytics tool.** Rejected: sends play data to a
  third party, contradicts the no-third-party privacy posture, and the data
  wouldn't be ours to train on in the shape we need.
- **One wide `impressions` table updated on exit.** Rejected: updates break
  append-only semantics and need UPDATE grants for the anon key. A page that
  dies mid-card would also leave a half-written row indistinguishable from a
  complete one.
