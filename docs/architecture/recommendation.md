# Recommendation architecture

Sip the Tea's long-term purpose is to recommend the right question for *this*
room at *this* moment, and eventually the right shape for the whole
conversation. This document describes the pieces that make that possible
without redesigning gameplay or telemetry, what exists today, and where each
piece is headed.

Code: `src/recommendation/` · Decisions: ADR 0003, 0004, 0005

## The draw, end to end

```
   App.tsx (gameplay)                      recommendation/                       telemetry/
 ┌─────────────────────┐          ┌──────────────────────────────────┐
 │ swipe left          │          │                                  │
 │  telemetry.exit()───┼──────────┼──────────────────────────────────┼──► card_exits
 │  forward(deck,pool) │──select─►│ RecommendationPolicy             │
 │                     │          │   CandidateGenerator  (eligible) │
 │                     │          │   ConversationArc     (phase)    │
 │                     │          │   QuestionRanker      (order)    │
 │                     │◄─────────│ Selection {candidate,            │
 │ deck.history += i   │          │   probability, candidateCount,   │
 │ deck.draws   += rec │          │   policyId, policyVersion,       │
 │                     │          │   arcPhase, remaining}           │
 │ render card         │          └──────────────────────────────────┘
 │  useCardTelemetry ──┼───────────────────────────────────────────────────► card_impressions
 └─────────────────────┘                                                    (with the DrawRecord)
```

Gameplay never reads a probability, a score or a phase. It asks for the next
card and shows it. Telemetry reads the `DrawRecord` the deck keeps alongside
history.

## The contracts

### `ContextSnapshot`
What is known about the room. Today: the pool (base on/off, enabled packs,
consented gated packs, pool size). Reserved: `group.size`,
`group.relationship`, `ceilings.spice`, and an open `dimensions` map.

- Immutable; a change makes a new snapshot.
- `null` always means unknown. A policy must never read null as "small group"
  or "no ceiling".

### `CandidateGenerator`
Produces the eligible set. **Every hard constraint belongs here:** disabled
packs, consent gates, and later the group's spice ceiling, content the group
has already seen, and archived revisions. A ranker only orders what the
generator allowed, so no learned model can reach past a gate.

Today: `PassWithoutReplacementGenerator`. It returns what's left in the
current pass through the pool, minus the card on screen, and refills with the
whole pool when the pass is empty.

### `QuestionRanker`
Orders candidates. Returns ephemeral scores used for one draw and discarded.
There is no global question score (strategy principle 3).

Today: none. The uniform policy doesn't rank.

### `ConversationArc`
The shape of a conversation over time: named phases (e.g. *warm-up → opening
up → deep → come back up*), each with tag preferences. `position(state,
context)` says where the next card falls. The engine's eventual unit of
recommendation is the arc, not the card.

Today: none. `arc_phase` is recorded as null.

### `RecommendationPolicy`
Composes the above and returns a `Selection` with the **exact probability** of
the chosen candidate. Pure given its inputs and the injected `random`.

Today: `UniformRandomPolicy` (`uniform_random@1`). Probability `1 / candidateCount`.

### `PolicyEvaluation`
Estimates how a candidate policy would have done on logged decisions, relative
to the baseline, under an explicitly named outcome definition (e.g. "session
has a nomination", "device returns within 14 days"). Implementations will be
standard off-policy estimators (inverse propensity scoring, self-normalized
IPS, doubly robust) fed from `research_impressions`.

Today: none.

## Selection probabilities, baselines and fair evaluation

This section is for an engineer who has never worked on a recommender system.
It explains the most important and least obvious decision in this
architecture: **every card dealt records the exact probability with which it
was chosen, and a plain random shuffle is kept running forever.** Both exist
so that, years from now, someone can find out whether a new idea is actually
better *before* putting it in front of real tables, and can prove it
afterwards.

### Vocabulary

| Term | Meaning here |
|---|---|
| **Policy** | The code that picks the next card. Today `uniform_random`; later rules or a model. |
| **Context** | What the policy knew when it picked: the room (`ContextSnapshot`) and the session so far (`SessionState`). |
| **Action** | The card it picked (a `revision_id`). |
| **Candidates** | The cards it was allowed to pick from (after hard constraints). |
| **Outcome** (reward) | Something that happened afterwards that we care about. For example: this card was nominated as the best conversation. |
| **Selection probability** (propensity) | The probability the policy gave to the card it actually picked, in that context. |
| **Logging policy** | The policy that was running when the data was recorded. |
| **Candidate policy** (target policy) | A new policy we want to evaluate. |
| **Off-policy evaluation** | Estimating how the candidate policy *would have* done, using data logged by a *different* policy. |
| **Holdout** | Sessions deliberately kept on `uniform_random` so there is always a live comparison. |

### The problem these solve

Imagine it's 2029. The logs hold two years of play, and someone has written a
new policy, `TagRuleRanker@3`. The question is simple to ask: *would more
tables have had a great conversation if this policy had been dealing?*

The obvious approaches all give wrong answers:

1. **"Look at how the cards it likes did in the logs."** The logs don't show
   how those cards do in general. They show how they did *when and where the
   old policy chose to deal them*. If the old policy dealt deep questions only
   after an hour of warm-ups, deep questions look wonderful in the logs. A new
   policy that opens with them would not get those results. This is
   **selection bias**: the logging policy decided which situations each card
   was observed in.
2. **"Compare this month's nominations to last month's."** Everything else
   changed too: the deck, the season, who is playing, a viral TikTok. This is
   **confounding by time**.
3. **"Just ship it and watch."** That works, but only for one idea at a time,
   slowly, at the cost of real people's evenings if the idea is bad, and it
   still needs something to compare against (see *Why the permanent random
   baseline is required*).

Selection probabilities fix (1). The permanent random baseline fixes (2) and
makes (3) rigorous.

### Why selection probabilities are stored

If you know *how likely* the logging policy was to deal each card in each
situation, you can mathematically undo its bias. A card it dealt rarely in
some situation counts for more, and a card it dealt constantly counts for
less, so the reweighted logs look like the candidate policy had been dealing.
The standard technique is **inverse propensity scoring (IPS)**.

The probability **can't be reconstructed reliably after the fact**. It depends
on the exact code, version, randomness scheme, candidate set and state at the
moment of the draw. Policies get rewritten, deleted and forgotten. So it is
recorded at the moment of the decision, alongside the decision, forever.

Recording it costs one number per draw. Not recording it permanently removes
the ability to evaluate any future idea on past data.

### Exactly how they are represented

**At draw time (TypeScript).** `RecommendationPolicy.select()` returns a
`Selection`:

```ts
{
  candidate,          // the chosen card: index, questionId, revisionId, category, source, kind
  probability,        // exact P(chosen | context, state) under this policy, in (0, 1]
  candidateCount,     // how many cards were eligible
  policyId,           // 'uniform_random'
  policyVersion,      // '1'
  arcPhase,           // null until arcs exist
  remaining,          // pass state for the next draw
}
```

`deck.ts` stores `{ policyId, policyVersion, probability, candidateCount,
arcPhase }` as a `DrawRecord` next to each history entry, and the telemetry
hook copies it onto the impression.

**In the database.** Per draw, on `card_impressions`:

| Column | Type | Meaning |
|---|---|---|
| `selection_probability` | `double precision`, `> 0 and <= 1` | The chosen card's exact probability. |
| `candidate_count` | `integer >= 1` | Size of the eligible set. |
| `policy_id`, `policy_version` | `text` | Which policy, which version, produced the probability. |
| `display_kind` | `'draw'` | Only draws carry a probability. |
| `snapshot_id` | `uuid` | The context the decision was made in. |
| `card_position`, `display_seq`, `session_id` | | Where in the session's sequence the decision fell, so `SessionState` can be rebuilt. |
| `revision_id` | `text` | The exact wording chosen. |

Per session, on `play_sessions`:

| Column | Meaning |
|---|---|
| `experiment_id`, `experiment_arm` | Which comparison, and which side of it, this session was in. |
| `assignment_probability` | The probability this session was assigned to that arm. A second, session-level propensity, needed once sessions are randomly split between policies. |
| `catalog_version` | The exact set of wordings that could have been dealt. |
| `flags` | Product configuration, so sessions from different configurations are not pooled by accident. |

Rules the database enforces (`draws_carry_probability`):

- A **draw** may carry a probability.
- A **revisit** or **redisplay** (going back to a card, or re-showing it after
  the page returns) was not a decision, so its probability and count are
  **null**. It points to the original draw through `draw_impression_id`.
  Counting revisits as decisions would double-count and bias every estimate.

For `uniform_random@1`, `selection_probability = 1 / candidate_count` exactly.
A quick integrity check is `abs(selection_probability * candidate_count - 1) < 1e-9`.

**What is deliberately not stored:** the probability of every *other*
candidate. Standard IPS needs only the chosen card's probability. Because
policies are required to be **pure** (same inputs give the same distribution;
randomness is only used to sample from it), the full distribution for any
logged draw can be recomputed later: rebuild the context from `snapshot_id`,
the session state from earlier impressions, and the candidate set from
`catalog_version`, then call the same policy version. If a future policy is
too expensive to replay, an additive `draw_candidates` table can store its
distribution without changing anything existing.

### A worked example

Keep it tiny: four questions, A–D, and one outcome, "this card was nominated
as the best conversation" (1 or 0).

**The logs.** `uniform_random` dealt 1,000 cards, 250 of each, so each had
selection probability 0.25. The nominations that followed:

| Card | Dealt | Nominated | Rate |
|---|---|---|---|
| A | 250 | 50 | 20% |
| B | 250 | 25 | 10% |
| C | 250 | 25 | 10% |
| D | 250 | 100 | 40% |
| **All** | 1,000 | 200 | **20%** |

The random policy's value is 20%.

**The candidate policy** deals A 10%, B 10%, C 10%, D 70%. Would it do better?

**IPS estimate.** For every logged draw, multiply its outcome by a weight:

```
weight = P_candidate(card) / P_logging(card)
```

| Card | Weight | Weighted nominations |
|---|---|---|
| A | 0.10 / 0.25 = 0.4 | 50 × 0.4 = 20 |
| B | 0.10 / 0.25 = 0.4 | 25 × 0.4 = 10 |
| C | 0.10 / 0.25 = 0.4 | 25 × 0.4 = 10 |
| D | 0.70 / 0.25 = 2.8 | 100 × 2.8 = 280 |

Estimate = (20 + 10 + 10 + 280) / 1,000 = **32%**.

That is exactly the candidate's true value (0.1·20% + 0.1·10% + 0.1·10% +
0.7·40% = 32%), obtained **without the candidate policy ever dealing a card**.
With real data the estimate is noisy rather than exact, so it comes with a
confidence interval.

**Why the logging probability is essential.** Now suppose the logs came from
a rule-based policy that dealt D 70% of the time. The raw logged nomination
rate would describe *that* policy, not uniform and not the candidate. Without
knowing it dealt D with probability 0.7, the weights can't be computed and the
logs can't be corrected. With it, the same formula works. Context matters too:
if the old policy dealt D mostly to groups of close friends, D's high rate
partly reflects the friends. Because the probability is recorded *per context*
(the probability that policy gave D in that room), IPS corrects for that as
well.

### Why this enables future policy evaluation

With probabilities stored:

- **Any number of ideas can be screened offline**, cheaply, against the same
  history, before a single table sees them. Only promising ones go live.
- **Policies are comparable across time and versions**, because every
  estimate is anchored to what was actually logged and how likely it was.
- **Better estimators can be applied later** to the same logs. Self-normalized
  IPS, clipped IPS and doubly robust estimators all consume the same
  `(context, action, probability, outcome)` records.

Three limits every evaluator must respect:

1. **Support.** A candidate policy can only be evaluated on cards the logging
   policy could also have dealt in that context (probability > 0). If the
   logging policy never dealt a card to a room, the logs say nothing about how
   it would have gone there. `uniform_random` gives every eligible card a
   chance, which is the widest possible support. That is one reason future
   policies must pick by weighted random choice (for example softmax over
   scores) rather than always taking the top card: a policy that never
   explores makes its own logs useless for evaluating the next one.
2. **Variance.** Large weights (the candidate strongly prefers what the
   logging policy rarely dealt) make estimates noisy. Report confidence
   intervals, bootstrapped by **session** rather than by card, since cards in a
   session aren't independent. Consider clipped or self-normalized IPS, and
   doubly robust estimation when a model is available. Uniform logging keeps
   the largest possible weight at `candidate_count × P_candidate`, which is as
   small as it can be.
3. **Per-decision vs. per-session outcomes.** A nomination names a specific
   impression, so it can be credited to a single draw and IPS works per
   decision. "Did this device come back next week" belongs to the whole
   session. Evaluating it offline means multiplying the weights of every draw
   in the session, which becomes unusably noisy after a handful of cards.
   **Session-level outcomes must be evaluated online, against the live random
   holdout.** That is a second reason the holdout is permanent.

### Why the permanent random baseline is required

A share of sessions stays on `uniform_random` forever, even after better
policies exist (ADR 0004). This isn't sentimentality; it does five jobs
nothing else can:

1. **A live, concurrent comparison.** Holdout and new-policy sessions happen
   at the same time, to the same kind of players, with the same deck. Whatever
   the season, the news or the deck is doing affects both equally, so the
   difference between them is caused by the policy. This is the only
   trustworthy way to measure session-level outcomes like return.
2. **Unbiased data keeps flowing.** A policy that deals what it believes is
   best stops learning about everything else. Its logs increasingly describe
   only its own favorites, so the next policy has nothing to be evaluated on,
   and new or experimental questions never get a fair hearing. The holdout
   keeps producing full-support data about every eligible card in every
   context.
3. **Catching slow failure.** Learned systems can drift towards what's easy
   to reward instead of what's good: escalating spice, favoring questions that
   earn quick taps, narrowing to a few "safe" cards. A drifting policy can look
   fine against its own past. It can't hide from a comparison with random
   dealing measured the same week.
4. **Calibrating offline estimates.** The holdout lets offline estimates be
   checked against live results: estimate "candidate vs. random" from the
   logs, then run the candidate live against the holdout and compare. If the
   two disagree, the estimator or the logging is wrong, and it's far better to
   learn that before trusting the estimator on the next idea.
5. **An honest floor.** "Better than random" is the minimum claim any
   recommendation system must earn. Without the baseline, there is no way to
   know whether the engine is helping at all.

The cost is that some players always get the plain shuffle, which is exactly
the game Sip the Tea was before any of this existed. That is an acceptable
price for knowing.

### How to compare a future policy fairly against historical data

Follow this procedure. Record each step's choices with the result, so the
comparison can be reproduced.

**1. Write down the outcome before looking at results.** For example:
*"a draw is a success if it is the session's nomination in effect
(`research_nominations`)"*. Choosing the outcome after seeing which one
favors the new policy invalidates the comparison. Never use cards viewed, time
in app or dwell alone as the outcome (ADR-000).

**2. Select comparable logs.**
- `is_test = false`.
- `display_kind = 'draw'` only.
- Only `telemetry_schema_version` values whose definitions match the outcome.
- A single `catalog_version`, or a set whose candidate sets the new policy's
  generator can reproduce.
- Sessions whose `flags` match the product configuration being evaluated
  (e.g. `experimentalQuestions` on or off).
- Record the date range.

**3. Rebuild each decision.** For every logged draw, reconstruct the context
(`context_snapshots` via `snapshot_id`), the session state (earlier draws in
the same session by `display_seq`), and the candidate set.

**4. Check support.** Ask the candidate policy for its probability for the
logged card *in that reconstructed context*. If the candidate would deal cards
the logging policy gave zero probability to, report what share of the
candidate's probability falls outside support. The estimate says nothing about
that share.

**5. Compute the estimate.** Start with IPS, report self-normalized IPS
alongside it, and add doubly robust estimation when a reasonable outcome model
exists. Compute the baseline's own value on the same logs; for uniform-logged
data that is simply the observed average.

**6. Quantify uncertainty.** Bootstrap by resampling **sessions**. Report the
estimate, the baseline, the difference, and a confidence interval for the
difference. Report the largest weights and the effective sample size; if a
few draws dominate, say so.

**7. Check counter-metrics the same way.** Estimate the candidate's share of
spicy, high-risk and challenge cards, and its concentration on a few
questions. A policy that "wins" by escalating fails review regardless of the
headline number.

**8. Only then, test live.** Ship behind assignment: randomly assign sessions
(recording `experiment_id`, `experiment_arm`, `assignment_probability`), keep
the random holdout, and measure the pre-registered outcome and counter-metrics
on concurrent sessions, including session-level outcomes such as return.

**9. Record the result.** Store the `EvaluationResult` fields (candidate and
baseline policy ids and versions, outcome definition, estimator, estimate,
baseline estimate, confidence interval, number of decisions, notes) in the
decision log of `docs/strategy.md` or a linked evaluation report. A policy is
promoted only when both the offline estimate and the live comparison favor it
on conversation outcomes without harming the counter-metrics.

### Invariants that keep all of this possible

Breaking any of these silently destroys the value of every log recorded
before and after:

- Every draw records the exact probability of the chosen card under the policy
  that chose it.
- Policies are pure: the distribution depends only on the policy version,
  context and session state, and `random` is used only to sample from it.
- Hard constraints live in the candidate generator, so "the eligible set" is
  well defined and reconstructable.
- Policies deal by weighted random choice with non-zero probability for every
  candidate they consider acceptable, never strictly by taking the top card.
- Revisits and redisplays never carry a probability.
- `uniform_random` keeps a permanent share of sessions.
- Policy ids and versions are never reused for different behavior. Change the
  behavior, bump the version.

## Outcomes a policy may optimize

Allowed, in rough order of trust:

1. **Best-conversation nominations** (`research_nominations`): the most
   direct reflective signal.
2. **Return:** the same `device_id` starting another session later.
3. **Thumbs** on the exact impression, treated as noisy and reader-biased.
4. **Exit actions and dwell, interpreted in context.** A long visible dwell
   followed by `next` is weak evidence of conversation. Dwell alone is never an
   objective: a card can sit on screen because nobody wanted to answer it.

Never objectives: cards viewed, session length, time in app, taps, votes.

## Safety invariants

- Consent-gated packs are reachable only through the pool, which only contains
  what the table explicitly agreed to this session.
- A future spice ceiling set by the group is a generator filter, not a ranker
  feature.
- Community questions reach a candidate set only once an editor has made them
  experimental (and the flag is on) or canon.
- No policy may raise the group's own ceiling, re-enable a pack, or infer
  consent.

## Adding a policy (future)

1. Implement `CandidateGenerator`, optionally a `QuestionRanker` and a
   `ConversationArc`, and compose them in a `RecommendationPolicy` with a new
   `id` and `version`.
2. Unit test: probabilities sum to 1 over candidates, hard constraints hold,
   same random stream gives the same selection.
3. Evaluate offline against logged `uniform_random` sessions with a
   `PolicyEvaluation`.
4. Ship behind assignment: most sessions on the new policy, a permanent share
   on `uniform_random` (`experiment_id`, `experiment_arm`,
   `assignment_probability` on `play_sessions`).
5. Pass `policy` into `forward(deck, pool, { policy, context })`. Telemetry
   needs no change.

See [roadmap.md](../roadmap.md) for the staged path.
