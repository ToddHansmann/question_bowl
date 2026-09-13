# 0007 — "Best conversation" nomination

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

The strongest outcome signal for this product is reflective: *which question
did we talk about most?* But a Sip the Tea session has no reliable end. The
deck never runs out, and people put the phone down, lock it, or leave it on
the table. An end-of-session modal would rarely appear at the right moment,
and would interrupt the thing the product exists for.

## Decision

- A lightweight star in the top-left corner, available on every card.
- **One nomination per session.** Nominating another card replaces the
  previous one. Tapping the nominated card's star withdraws it.
- A nomination is of a *card* (its history position), not of one display of
  it. Revisiting the nominated card shows the star filled, and tapping
  "nominate" again on a revisit is a no-op.
- Stored as append-only `nominate` / `clear` events in
  `conversation_nominations`. The nomination in effect is the latest event per
  session (`research_nominations` view).
- A short confirmation ("Tonight's best conversation") fades in and out. No
  modal, no prompt, no reminders.
- Behind the `bestConversation` flag, on by default.

## Consequences

- Most sessions will have no nomination. Absence is not a negative signal, and
  analysis must not treat it as one.
- A nomination is made by whoever holds the phone. It is a signal about the
  room, recorded through one person.
- The nomination is never shown back as a leaderboard or count. It is a
  research outcome, not a social feature (strategy principle: no metric
  players can chase).

## Alternatives considered

- **End-of-session modal.** Rejected by product direction; see Context.
- **Multiple favorites.** Rejected: "best" loses meaning when it isn't
  scarce, and a one-per-session constraint makes the signal comparable across
  sessions.
