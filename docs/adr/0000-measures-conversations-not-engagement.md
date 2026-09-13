# ADR-000 – Sip the Tea Measures Conversations, Not Engagement

- **Status:** Accepted, doctrine
- **Date:** 2026-09-13
- **Supersedes:** nothing
- **Can be superseded by:** only an ADR that explicitly argues against each principle it changes, approved by the product owner

## Why this record is numbered zero

Every other ADR records a technical choice that could reasonably have gone
another way. This one records what the product *is for*. The other decisions
exist to serve it, and each should be read in its light. If a future design
conflicts with this record, the design is wrong until this record is formally
changed.

## Context

Sip the Tea is a game played by people sitting together, answering questions
out loud. Its value is produced away from the screen, in the conversation the
question starts. The phone's best moment is the one where nobody is looking
at it.

Most consumer software measures itself by what happens *on* the screen: taps,
sessions, time spent, items consumed. Adopting those measures here would
quietly invert the product. A question that starts a twenty-minute
conversation produces one card view and a long pause; a dull question produces
a fast swipe and another card. A system rewarded for card views would learn to
deal dull questions. A system rewarded for time in app would learn to keep
people looking at their phones. Neither failure would be visible in a
dashboard. Both would be visible at the table.

Sip the Tea is now building a recommendation engine: software that learns
from play which questions to deal. A learning system optimizes whatever it is
pointed at, relentlessly. So what it is pointed at has to be decided once,
explicitly, before it exists.

## Decision

The following principles are permanent architectural doctrine.

### 1. The unit of value is a real conversation, not a card.

A card is a means. Success is a conversation people are glad they had. Every
metric, model, dashboard and feature is judged by whether it helps real
conversations happen between people in the same room.

*In practice:* per-card and per-session interaction counts are never success
metrics. Outcome signals that describe the conversation (a best-conversation
nomination, a group coming back another night) outrank signals that describe
screen interaction.

### 2. The product optimizes for meaningful conversations rather than screen time.

Engagement matters only as evidence that conversations were worth having. It
is measured as *return*: people choosing to play again. It is never measured
as intensity: more cards, longer sessions, more taps.

*In practice:* cards viewed, time in app, session length, votes cast and taps
are never objectives, targets, OKRs, or rewards for any model. Dwell time is at
most a weak, context-dependent feature, because a card can stay on screen
because nobody wanted to answer it. Features that pull attention to the screen
(streaks, notifications to play, leaderboards, counters shown to players) need
an ADR arguing against this principle.

### 3. Recommendation quality is always measured against `UniformRandomPolicy`.

The uniform random shuffle is the permanent baseline. No recommendation policy
is considered better until it has been shown to produce better conversation
outcomes than random dealing, under an outcome definition written down before
the comparison. A share of sessions stays on the random policy forever, so the
comparison is always available.

*In practice:* every draw logs its exact selection probability; every session
records its policy and experiment assignment; no policy ships as a replacement
for random without evidence against a random holdout. See ADR 0004 and
[architecture/recommendation.md](../architecture/recommendation.md).

### 4. Telemetry exists to improve conversations, not to maximize engagement.

What is recorded is recorded so that future versions of the game can deal
better questions to the right rooms at the right moments. It is not recorded
to increase usage, and it is never used to identify, profile, or market to the
people who play.

*In practice:* no accounts are required to play; ids are anonymous and random;
nothing anyone says is ever recorded; no third party receives play data;
devices can be excluded; nothing is inferred about a person's identity from
the packs they choose. Players are never told the game is "collecting data".
They are told, truthfully, that great conversations shape tomorrow's questions.

### 5. Recommendation systems may change repeatedly, but telemetry should remain stable.

Policies will be rewritten many times over a decade: shuffle, rules, learned
models, arc engines. The record of what happened at the table must outlive
every one of them.

*In practice:* telemetry stores raw, append-only events, never derived scores.
The meaning of a recorded field never changes. A new meaning gets a new field,
and a change in *how* something is measured bumps the telemetry schema
version. Policies plug in behind stable interfaces (ADR 0003), so changing a
policy never requires changing what is logged.

### 6. Question IDs are permanent, and wording revisions never overwrite historical data.

A question's id is its identity for the life of the product. It is never
reused, renumbered, or deleted. Its wording may change, but every distinct
wording is a separate revision, and data collected about one wording stays
attached to that wording forever.

*In practice:* revision ids are derived from the text itself and enforced by
the database (ADR 0002). Archiving replaces deleting. Catalog, lifecycle and
tag history are append-only.

## Consequences

- Some ideas that would raise usage numbers will be rejected. That is the
  intent.
- Evaluating a recommendation policy is slower and more rigorous than watching
  a usage chart go up, and requires a permanent random holdout that some
  players will always be in.
- Dashboards present telemetry as *pipeline health* and *conversation
  outcomes*, never as growth metrics to push.
- Schema changes to telemetry are additive and deliberate, which makes them
  slower to add, and means the history remains usable for as long as the
  product exists.
- Product copy describes the human benefit ("the best questions stay"), never
  the mechanism.

## How to apply this record

Before shipping a feature, metric, model or dashboard, answer:

1. Does this help real conversations happen, or does it help people look at
   the screen?
2. What outcome does it optimize or report, and is that outcome about
   conversations?
3. If it changes how cards are chosen, how will it be compared against
   `UniformRandomPolicy`, and is that comparison defined in advance?
4. Does it change what an existing telemetry field means, or store a derived
   score? (It must not.)
5. Could it overwrite, reuse or detach a question id or revision? (It must not.)

A "no" to question 1, or an unclear answer to 2 or 3, means the proposal needs
revision before it proceeds.

## Related

- [docs/strategy.md](../strategy.md) — vision, doctrine, open questions
- ADR 0001 (dedicated telemetry), 0002 (identity and revisions), 0003
  (recommendation framework), 0004 (uniform random baseline), 0007 (best
  conversation nomination)
