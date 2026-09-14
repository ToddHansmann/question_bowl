# 0003 — Recommendation framework interfaces

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

Today the deck is a shuffle. Over the next decade it should become rule-based
recommendations, then a learning system that recommends conversation *arcs*.
Each of those will be rewritten more than once. Gameplay code and telemetry
must not be rewritten with it.

## Decision

Six contracts in `src/recommendation/types.ts`:

| Contract | Responsibility |
|---|---|
| `ContextSnapshot` | Everything known about the room at a moment. Immutable; `null` means unknown. |
| `CandidateGenerator` | Produces the eligible set. **All hard constraints live here** (packs, consent, later the spice ceiling). |
| `QuestionRanker` | Orders eligible candidates. Scores are ephemeral and never persisted. |
| `ConversationArc` | Names the phase of the conversation the next card falls in. |
| `RecommendationPolicy` | Returns one `Selection` with its **exact selection probability**. |
| `PolicyEvaluation` | Estimates a candidate policy's outcomes from logged decisions, against the baseline. |

Invariants every policy keeps:

1. **Exact, logged selection probability.** Deterministic policies return 1.
   This is what makes counterfactual evaluation of any future policy against
   any past log possible.
2. **Constraints before optimization.** A ranker never sees an ineligible
   candidate, so no optimization can reach past a consent gate.
3. **Purity.** A policy's only randomness is the injected `random`; it does
   no I/O and reads no clock.
4. **No global question score.** Scores exist for one draw.

The deck (`src/deck.ts`) calls `policy.select(...)` and stores a `DrawRecord`
next to each history entry. Telemetry reads that record. Gameplay never reads
it.

## Consequences

- A new policy is a new class passed to `forward(deck, pool, { policy })`.
  Nothing in `App.tsx` or `telemetry/` changes.
- The shuffle was re-expressed to make its probability exact (see ADR 0004).
- `ConversationArc`, `QuestionRanker` and `PolicyEvaluation` have no
  implementations yet, by design. Shipping interfaces without implementations
  risks the interfaces being wrong. That risk is accepted because the
  alternative, retrofitting probabilities and context onto years of logs, is
  impossible.

## Alternatives considered

- **Build the rule engine now.** Rejected: there are no tags and no outcome
  data yet to write rules against.
- **Log only the chosen question.** Rejected: without the probability, logs
  from a non-uniform policy can't be used to evaluate a different policy.
