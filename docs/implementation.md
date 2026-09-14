# Implementation guide

How the recommendation foundation is built, where everything lives, and how
to do the common jobs: tag questions, run the community workflow, check
telemetry, and add things without breaking the ten-year contracts.

## Map of the code

```
src/
  App.tsx                     gameplay (unchanged behavior) + onboarding, star, About
  deck.ts                     history/cursor/bag + DrawRecord per card; asks a policy for draws
  questions.ts                content; CATALOG, CATALOG_VERSION, revisionIdByIndex, communityQuestions
  flags.ts                    feature flags (ADR 0009)
  onboarding.ts               one-time welcome: copy + persistence
  analytics.ts                legacy traffic events, device/session ids (unchanged, `uuid` exported)
  supabase.ts                 restInsert (unchanged) + restInsertStatus (status-aware, keepalive)
  catalog/
    revision.ts               sync SHA-256, revisionIdFor()
    lifecycle.ts              statuses + allowed transitions
    tags.ts                   tag scheme v1 + validation
    questionTags.ts           MANUAL tags by question id (empty at launch)
  recommendation/
    types.ts                  the contracts (ADR 0003)
    uniformRandom.ts          UniformRandomPolicy + PassWithoutReplacementGenerator
    context.ts                buildContextSnapshot, sameContext
  telemetry/
    schema.ts                 row types, exit actions, schema version
    dwell.ts                  DwellClock (visible/obscured/hidden ms)
    tracker.ts                SessionTracker, the pure state machine
    outbox.ts                 durable delivery with retry
    index.ts                  browser wiring (clock, ids, storage, network)
    useCardTelemetry.ts       the React hook App.tsx uses
  admin/Foundation.tsx        Community questions · Catalog · Data health panels
supabase/migrations/          full history (7 recorded + 4 new)
test/
  deck.test.ts                original deck checks (unchanged)
  catalog.test.ts             revisions, lifecycle, tags, TS↔SQL parity
  recommendation.test.ts      policy behavior and exact probabilities
  telemetry.test.ts           dwell, tracker rules, outbox guarantees, flags
  db.test.ts                  every migration on PGlite, exercised as anon/non-admin/admin
docs/                         this, the spec, schema, ADRs, roadmap, strategy
```

## What changed for players

| Change | Where |
|---|---|
| Home screen line: *Discover what people are really curious about.* | `App.tsx` landing |
| One-time welcome before the first game, ~10 seconds to read | `App.tsx` + `onboarding.ts`, flag `onboarding` |
| Star (top-left) to mark tonight's best conversation | `App.tsx`, flag `bestConversation` |
| About page (menu → *About Sip the Tea*) | `App.tsx` menu view `about` |
| Nothing else. Same deck, same swipes, same packs, same consent, same ratings, same suggestions. | |

No user-facing copy mentions algorithms, recommendations, telemetry,
analytics, AI or machine learning. Keep it that way; prefer the human benefit
("the best questions stay") over the mechanism.

## How telemetry hooks into gameplay

`App.tsx` does two things and nothing more:

1. Calls `telemetry.exit(action)` immediately before it moves the deck
   (`go()`), and `telemetry.thumb(value)` when a rating is given.
2. Passes its state to `useCardTelemetry(...)`.

The hook watches state and drives the tracker:

| Effect | Records |
|---|---|
| deck appears (`started`) | `play_sessions` |
| pool, consent or packs change | `context_snapshots` (declared before the card effect, so an impression always has a snapshot) |
| card on screen changes / pool empties / page restored | `card_impressions`, or `card_exits: pool_emptied` |
| menu opens/closes | `obscured` / `unobscured` |
| `visibilitychange` | `hidden` / `visible` + urgent flush |
| `pagehide` | exit `background` or `session_abandoned` + keepalive flush |
| `pageshow` (persisted) | re-show as `redisplay` |

The tracker is pure and unit-tested. The hook is thin and verified in the
browser with `?qbflags=telemetryDebug`.

## Tagging questions

1. Open `src/catalog/questionTags.ts`.
2. Add an entry per question id, using only values from `src/catalog/tags.ts`:
   ```ts
   'exp-172': {
     depth: 'personal',
     spice: 'mild',
     energy: 'lively',
     format: 'story',
     familiarity_required: 'strangers',
     group_size_fit: ['small', 'large'],
     risk: 'low',
   },
   ```
   Partial records are fine. Leave a dimension out rather than guess.
3. `npm test`. Unknown ids and invalid values fail.
4. Deploy, then **/admin → Catalog → Sync this build** to record the tags
   against the current revisions.

Tags are written by a person. Do not generate them.

## Community questions

The full editorial loop. Every step records who and why.

1. **A player submits** through *Suggest a question*. It lands in
   `question_suggestions`, unchanged from before.
2. **/admin → Community questions → Accept as draft.** Optionally edit the
   wording and choose a category. The database allocates `com-NNNN`, records
   the wording as revision 1, and sets status **Draft**. *Decline* and
   *Duplicate…* record the other outcomes.
3. **Revise wording** while in Draft if needed (each edit is a new revision).
4. **Move to Experimental** (reason required). Then **Copy questions.ts line**
   and paste it into `communityQuestions` in `src/questions.ts`:
   ```ts
   { id: 'com-0001', category: 'Personal', status: 'experimental', submissionId: '…uuid…', text: "What hill would you die on?" },
   ```
   For a Dare or Dark Room entry, add `kind: 'challenge'`.
   Deploy. It is dealt only where `experimentalQuestions` is on
   (`VITE_FLAGS=experimentalQuestions` for everyone, or `?qbflags=experimentalQuestions`
   on one device).
5. **Promote to Canon** (reason required), change the line's `status` to
   `'canon'`, deploy. It now plays for everyone, in its category (or with Base
   if it has none).
6. **Archive** when it has run its course: record it in the dashboard, set the
   line's `status` to `'archived'`, and deploy. Never delete the line.
7. **Sync this build** after deploying. Any disagreement between the build and
   the editorial record shows up under *Build and editorial record disagree*.

## Rewording or retiring editor-authored questions

Unchanged from before: edit `questions.ts` directly (never change an id; use
`retired` to archive). The new part: after deploying, **Sync this build**.
Rewordings become new revisions automatically; retirements are recorded as
`canon → archived` by `catalog-sync`. Un-retiring must go through
Experimental and is reported as skipped if attempted directly.

## Checking telemetry

- **Locally:** `http://localhost:5173/?qbflags=telemetryDebug`, then inspect
  `window.__sttTelemetry` or the console. Dev never writes to Supabase.
- **In production:** /admin → Data health. *Integrity problems* should stay 0.
  *Exits reported* below roughly 60% suggests exits are being lost at teardown
  (expected to be lower on iOS home-screen installs).
- **Research queries:** start from `research_impressions`,
  `research_nominations`, `research_sessions` (admin-readable).

## Feature flags

See ADR 0009. Useful device URLs:

| URL | Effect |
|---|---|
| `?qbflags=telemetryDebug` | log telemetry rows |
| `?qbflags=experimentalQuestions` | deal experimental community questions on this device |
| `?qbflags=-bestConversation` | hide the star on this device |
| `?qbflags=reset` | clear this device's overrides |
| `?qbonboarding=reset` | show the welcome again (also in /admin → Data health) |
| `?qbtest=1` | tag this device's rows `is_test` (existing) |

## Tests

```bash
npm test          # deck + catalog + recommendation + telemetry (pure, fast)
npm run test:db   # all migrations on PGlite; RLS, lifecycle, sync, telemetry inserts, views
npm run build     # typecheck + production bundle
```

`npm run test:db` needs no Supabase project and no network after
`npm install`.

## Known, preserved quirks

- On first render, `App.tsx` resets the pass over the whole base pool,
  including the first card already dealt, so that card can come round once
  more within the first pass. This predates the foundation and is preserved
  exactly (a gameplay change would need its own decision). Telemetry records
  the true probabilities.
- A thumbs rating is still once per device per question (not per session),
  as before.

## Rules for future changes

- Never change a question id. Never reuse one.
- Never change what an existing telemetry field means. Add a field.
- Never compute and store a score. Compute in a view or at analysis time.
- Never add a hard constraint to a ranker. Put it in the generator.
- Never promote content automatically.
- Every new policy records its exact selection probability and stays
  measurable against `uniform_random`.
- Every new success metric must describe conversations, not screen
  interaction.
