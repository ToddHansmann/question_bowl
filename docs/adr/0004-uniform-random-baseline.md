# 0004 — The uniform random shuffle is the permanent baseline

- **Status:** Accepted
- **Date:** 2026-09-13

## Context

Recommendation systems are easy to believe in and hard to prove. Without a
standing comparison, a policy can "improve" metrics by learning to show
whatever is easiest to measure, or by escalating spice, while real
conversations get worse. It is also easy to lose the ability to answer "is
any of this better than just shuffling?"

The shuffle has a second property worth protecting: every card it deals is a
randomized experiment. Logs from a uniform policy are unbiased evidence about
every question in the pool.

## Decision

1. The shuffle becomes `UniformRandomPolicy` (`id: uniform_random`,
   `version: 1`) and is the only policy today.
2. It picks uniformly from what's left in the current pass, excluding the card
   on screen. That keeps the original guarantees (see the whole pool before
   repeats, no back-to-back repeats) and makes each draw's probability exactly
   `1 / candidateCount`. The original pre-shuffled bag with an end-swap gave
   an identically distributed sequence from the player's side, but a
   probability that was hard to state.
3. **When any other policy ships, a fixed share of sessions stays on
   `uniform_random` permanently**: the holdout. Every session records
   `experiment_id`, `experiment_arm` and `assignment_probability` from day
   one, so this needs no schema change.
4. No policy is promoted unless it beats the holdout on conversation-quality
   outcomes (nominations, return visits), never on cards viewed or time in
   app.

## Consequences

- Some players will always get the plain shuffle. That is the cost of knowing.
- Every session today is `experiment_id = 'baseline'`,
  `experiment_arm = 'uniform_random'`, `assignment_probability = 1`.
- A known pre-existing quirk is preserved exactly: on mount, `App.tsx` resets
  the pass over the whole pool including the first card dealt, so that card
  can come round once more before the pass ends. Telemetry logs the true
  probabilities of this behavior. Fixing it is a gameplay change for a
  separate decision.

## Alternatives considered

- **Retire random once a better policy exists.** Rejected: that removes the
  only unbiased measuring stick, and the only way to detect a policy slowly
  going wrong.
- **Epsilon-greedy exploration inside the new policy instead of a holdout.**
  Complementary, not a replacement: exploration within a policy doesn't answer
  whether the policy as a whole beats shuffling.
