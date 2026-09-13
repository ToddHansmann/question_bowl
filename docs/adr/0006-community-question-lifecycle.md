# 0006 — Community question lifecycle

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

Sip the Tea now invites community questions and promises players that "the
best questions stay." Two failure modes have to be designed out from the
start:

1. **Automatic promotion.** Any threshold ("50 thumbs up → canon") becomes
   something to game, and optimizes for what's easy to like rather than what
   opens a room up.
2. **Two sources of truth.** Playable content lives in `questions.ts`
   (reviewed and deployed through git), while editorial decisions happen in a
   dashboard. They will drift.

## Decision

**States:** `draft → experimental → canon → archived`, with
`archived → experimental` for a retest. Draft can't skip to canon, and
archived can't jump back to canon (`LIFECYCLE_TRANSITIONS`, mirrored by
`lifecycle_transitions` and enforced by a trigger).

**Every transition is a person's decision**, recorded append-only in
`question_lifecycle_events` with their email and a reason. No code path
promotes anything.

**Where each state lives:**

| State | Lives in | Dealt? |
|---|---|---|
| draft | Database only | Never |
| experimental | Database decision + a line in `communityQuestions` | Only with the `experimentalQuestions` flag |
| canon | Database decision + a line in `communityQuestions` | Always |
| archived | Database decision (+ line status updated, or `retired` for editor-authored) | Never |

**Authority:**

- Editor-authored questions (original, todd): **the code is the authority**.
  Catalog sync records changes made in `questions.ts` as transitions by
  `catalog-sync`.
- Community questions: **the database is the authority**. Sync reports drift
  ("build says experimental, database says canon") and never overwrites the
  editorial record.

**Submissions are raw and untouched.** `question_suggestions` rows are never
edited. Decisions go in `submission_reviews` (accepted / declined /
duplicate). Accepting allocates a permanent `com-NNNN` id and records the
possibly edited wording as the first revision.

## Consequences

- Promotion to a playable state takes two steps, a dashboard decision and a
  code change. That friction is deliberate: content players see is always
  code-reviewed and deployed, and always has a recorded decision behind it.
- The dashboard offers a **Copy questions.ts line** button to make the second
  step mechanical.
- `experimentalQuestions` is off by default, so no experimental question
  reaches players until someone chooses to run that test.

## Alternatives considered

- **Load experimental questions from the database at runtime.** Rejected for
  now: it adds a network read in front of the first card and bypasses code
  review for player-visible content. Revisit when an exposure-budget policy
  needs to rotate many experimental questions.
- **Vote-based promotion.** Rejected; see Context.
