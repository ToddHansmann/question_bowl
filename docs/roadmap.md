# Roadmap: from shuffle to conversation engine

```
Stage 0             Stage 1              Stage 2                Stage 3                  Stage 4
Random shuffle  ──► Measured shuffle ──► Rule-based         ──► Learning engine      ──► Arc engine
(before 9/13)       (now)                recommendations        (contextual bandit)       (conversation shapes)
```

Each stage **adds implementations behind contracts that already exist**. None
of them changes the telemetry schema's meaning, the question identity model,
or gameplay code. That's the test of whether the foundation is right: if a
stage needs a rewrite of the parts below it, stop and write an ADR first.

The gate between stages is evidence, not the calendar.

---

## Stage 1: Measured shuffle *(shipped 2026-09-13)*

**What exists:** `UniformRandomPolicy` with exact probabilities; full
impression / exit / dwell / context / nomination telemetry; permanent
question and revision ids; the tag scheme; the community lifecycle; research
views; data health.

**Work in this stage (no new architecture):**
- Apply migrations, deploy, sync the catalog (see migration-notes.md).
- **Tag the deck by hand.** Target: every Base and Warm-up question fully
  tagged, then the rest.
- Run the editorial loop on real submissions. Put the first experimental
  community questions in front of test tables with `?qbflags=experimentalQuestions`.
- Watch **Data health** until integrity problems are routinely zero and exit
  reporting is understood per platform.
- First descriptive research (no optimization): nomination rate by pack, by
  position in session, by `display_mode`; exit mix by question; how often the
  first N cards include a nomination.

**Gate to Stage 2:**
- ≥ 90% of dealt questions tagged on depth, spice, risk and familiarity.
- ≥ 1,000 non-test sessions, and enough nominations that per-tag nomination
  rates have usable confidence intervals.
- A written, agreed outcome definition (e.g. *"a session with a nomination"*
  plus *"device returns within 14 days"*), recorded in strategy.md.

---

## Stage 2: Rule-based recommendations

**What gets built, and where it plugs in:**

| Piece | Implements | Notes |
|---|---|---|
| Room read (optional, 1–2 taps) | fills `ContextSnapshot.group` / `ceilings` | UI change; its own design decision. Columns already exist. |
| `ConstrainedGenerator` | `CandidateGenerator` | Adds the spice ceiling, familiarity vs. relationship, and already-seen filters on top of the pass. |
| `EditorialArc@1` | `ConversationArc` | Phases written by editors in tag terms (e.g. positions 1–3: depth ≤ light, risk low). |
| `TagRuleRanker@1` | `QuestionRanker` | Scores candidates by fit to the arc phase. |
| `RuleBasedPolicy@1` | `RecommendationPolicy` | **Softmax** over ranker scores (not argmax), so every eligible candidate keeps non-zero probability and the logs stay evaluable. Logs `arc_phase`. |
| `IPSEvaluation` | `PolicyEvaluation` | Offline estimate against Stage 1 logs before anything ships. |
| Session assignment | `play_sessions.experiment_*` | e.g. 80% rule-based, **20% `uniform_random` holdout, permanently**. |

**Nothing else changes:** `App.tsx` passes `{ policy, context }` to
`forward`, and telemetry records what it already records.

**Gate to Stage 3:**
- The rule-based policy beats the holdout on the agreed outcome with
  confidence, and does **not** move counter-metrics in a bad direction
  (spice share of dealt cards, risk-high share, skips).
- Enough traffic that per-context estimates are stable.

---

## Stage 3: Learning recommendation engine

**What gets built:**

| Piece | Implements | Notes |
|---|---|---|
| Feature builder | reads `research_impressions` + `question_current_tags` + `context_snapshots` | Features are computed, never stored as question properties. |
| `ContextualBanditRanker` | `QuestionRanker` | e.g. Thompson sampling over (context × tag) features. Trained offline, shipped as static parameters in the bundle so it still works offline at a party. |
| `LearnedPolicy@n` | `RecommendationPolicy` | Same constrained generator, same arc (or learned phase boundaries), same exact probabilities. |
| `DoublyRobustEvaluation` | `PolicyEvaluation` | Guards against the variance of pure IPS. |
| Model registry | `policy_version` | A version string is a model artifact id. No schema change. |

**Hard rules carried forward:**
- Constraints stay in the generator. The model never sees ineligible questions.
- The holdout stays.
- Objectives are conversation outcomes. Dwell is at most a weak feature, never
  a target.
- Community experimental questions get a **guaranteed exploration budget**, so
  new questions can earn their place.

**Gate to Stage 4:** the learned policy beats Stage 2 *and* the holdout, and
per-phase analysis shows sequence matters (some orderings of the same
questions produce more nominations than others).

---

## Stage 4: Arc engine

The engine recommends **the shape of the conversation**: how fast to go
deeper, when to lighten, when to hand the room a dare. It then chooses
questions within that shape.

| Piece | Implements |
|---|---|
| `LearnedArc` | `ConversationArc`: phase transitions learned from sequences in `research_impressions` ordered by `display_seq` |
| Sequence-aware ranker | `QuestionRanker` using `SessionState.history` |
| Group memory (opt-in, device-local) | extends `ContextSnapshot.dimensions`, then promoted columns | Avoids repeats for returning groups. Local-first; a privacy decision of its own. |

Telemetry already records the sequence (`display_seq`, `card_position`,
`display_kind`), the context at each point (`snapshot_id`), and the outcome
(nomination, exits). Stage 4 needs no new telemetry, only more of it.

---

## Things deliberately not on this roadmap

- Public voting, leaderboards, contributor profiles.
- Showing players counts of anything (likes, nominations, plays).
- Any metric of screen time.
- Generated questions or generated tags.
- Accounts as a requirement to play.

Each of these would need an ADR that argues against docs/strategy.md
explicitly.

## Where each future piece plugs in

| Future need | Existing seam | Schema change? |
|---|---|---|
| New policy | `RecommendationPolicy`, `forward(..., { policy })` | No |
| Holdout / A-B | `play_sessions.experiment_id/arm/assignment_probability` | No |
| Room read | `ContextSnapshot.group/ceilings`, `context_snapshots` columns | No |
| New context dimension | `dimensions jsonb`, promoted to a column later | Only at promotion |
| Arc phase | `Selection.arcPhase` → `card_impressions.arc_phase` | No |
| Skip gesture | `skipGesture` flag, `exit_action = skip` | No |
| Reroll control | `exit_action = reroll` | No |
| New outcome signal | New append-only table + view | Yes (additive) |
| New tag dimension | `TAG_DIMENSIONS` + sync | No (data only) |
| Experimental rotation from server | New read path (ADR needed) | Maybe |
