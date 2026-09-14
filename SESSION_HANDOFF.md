# Session handoff: recommendation foundation

**Written:** 2026-09-13, end of session
**For:** a brand-new Claude Code session with no memory of this work
**Repo:** `C:\Users\toddh\OneDrive\Documents\Question Bowl\question_bowl` (Sip the Tea, live at sipthetea.app)

---

## 1. Where things stand

| | |
|---|---|
| **Branch** | `feature/recommendation-foundation` (local only; never pushed) |
| **Implementation commit** | `b4439464bb1dd3c65da62c8a1a3b39321a4904cd` |
| **Handoff commit** | The commit directly on top of that one, containing only this file |
| **Base** | `main` at `fc665b6` (= `origin/main`, unchanged) |
| **Pushed / PR / merged** | No / No / No |
| **Deployed to Vercel** | **No.** Production still runs `fc665b6`. |
| **Production DB migrations** | **Not applied.** QB Production (`wxvynkalkjrtygcjjyxy`) still lists only its original 7 migrations. The owner explicitly said: *do not apply production migrations yet.* |
| **Tests at commit** | `npm test`: 34 deck + 58 unit pass · `npm run test:db`: 22 pass · `npm run build`: succeeds |

Verify on resume:

```bash
git branch --show-current
```
```bash
git log --oneline -3
```
```bash
npm test
```
```bash
npm run test:db
```

---

## 2. What this work is

Sip the Tea's long-term goal is to become **the best recommendation engine
for meaningful in-person conversations**, not the largest library of
questions. This branch builds the permanent foundation for that **without
changing how the game plays**. It has no machine learning and no
recommendation algorithm beyond the existing shuffle.

The governing doctrine is **`docs/adr/0000-measures-conversations-not-engagement.md`**:

- the unit of value is a real conversation, not a card
- optimize for meaningful conversations, never screen time
- always measure against `UniformRandomPolicy`
- telemetry exists to improve conversations
- telemetry stays stable while policies change
- question ids are permanent, and revisions never overwrite history

---

## 3. What was completed

### Player-visible (the only gameplay-adjacent changes)
- Home screen: *"Discover what people are really curious about."* beneath *"Answer out loud."*
- A one-time welcome before a device's first game (copy in `src/onboarding.ts`), persisted in localStorage. Reset with `?qbonboarding=reset` or from /admin.
- A ☆ in the top-left of the deck: **one "best conversation" nomination per session**. Nominating another card replaces it; tapping again clears it.
- An **About Sip the Tea** page in the menu.
- No user-facing copy mentions algorithms, telemetry, analytics or AI.
- Dealing, swipes, packs, consent gates, ratings and suggestions are unchanged.

### Architecture
- **Question identity** (`src/catalog/revision.ts`): permanent ids;
  `revisionId = questionId@sha256(NFC(text))[0:12]`, computed in TS and
  enforced by a SQL CHECK. `CATALOG`, `CATALOG_VERSION` and
  `revisionIdByIndex` are in `src/questions.ts`.
- **Recommendation contracts** (`src/recommendation/types.ts`):
  `RecommendationPolicy`, `CandidateGenerator`, `QuestionRanker`,
  `ConversationArc`, `ContextSnapshot`, `PolicyEvaluation`. The shuffle is now
  `UniformRandomPolicy` (`uniformRandom.ts`), which logs the exact selection
  probability (`1/candidateCount`). `deck.ts` stores a `DrawRecord` per card.
- **Telemetry** (`src/telemetry/`): sessions, context snapshots, impressions
  (draw / revisit / redisplay), visibility (hidden / visible / obscured),
  exits (next, skip, back, reroll, background, session_abandoned,
  pool_emptied, superseded), dwell in ms that pauses while hidden, thumbs, and
  nominations. There's a pure `SessionTracker`, a `DwellClock`, an offline
  `Outbox` (localStorage, retry, 409 treated as delivered), and a
  `useCardTelemetry` hook that `App.tsx` calls.
- **Tags** (`src/catalog/tags.ts`): 7 manual dimensions (depth, spice,
  energy, format, familiarity_required, group_size_fit, risk).
  `questionTags.ts` is **intentionally empty**; tags are written by people only.
- **Community lifecycle** (`src/catalog/lifecycle.ts`): Draft → Experimental
  → Canon → Archived, editorial only. Drafts live in the DB; experimental and
  canon ship via `communityQuestions` in `questions.ts`.
- **Feature flags** (`src/flags.ts`): on by default are `telemetry`,
  `telemetryOutbox`, `bestConversation` and `onboarding`; off by default are
  `experimentalQuestions`, `skipGesture` and `telemetryDebug`. Override per
  device with `?qbflags=name,-name`, or per build with `VITE_FLAGS`.
- **Admin** (`src/admin/Foundation.tsx`), three new /admin panels:
  **Community questions** (accept, decline, duplicate, revise, transition,
  copy the `questions.ts` line), **Catalog** ("Sync this build"), and
  **Data health**.

### Database (`supabase/migrations/`)
- **7 existing migrations**, recorded verbatim from production. **Already
  applied in prod. Never re-apply.**
- **4 new migrations, NOT applied:**
  1. `20260913120000_question_catalog_lifecycle_and_tags.sql`
  2. `20260913120100_play_telemetry.sql`
  3. `20260913120200_editorial_workflow.sql`
  4. `20260913120300_research_views.sql`
- The only change to an existing object: the `question_ratings.source` CHECK
  now also allows `'community'`.
- RLS on everything: the app can only INSERT telemetry; admins read. Event
  tables are append-only by trigger. Views use `security_invoker`.

### Tests
- `test/catalog.test.ts`, `recommendation.test.ts` and `telemetry.test.ts`
  run via `npm test` (`test/all.ts`).
- `test/db.test.ts` runs via `npm run test:db`. It replays all 11 migrations
  on **PGlite** (in-process Postgres 18) with Supabase-like roles and grants,
  and tests RLS, the lifecycle, catalog sync, telemetry inserts and views. It
  caught and fixed one real bug in catalog sync.

### Docs
`docs/strategy.md` (living strategy + decision log + open questions Q1–Q8) ·
`docs/roadmap.md` · `docs/architecture/recommendation.md` (selection
probabilities, IPS, permanent baseline, fair evaluation) ·
`docs/telemetry-spec.md` · `docs/schema.md` · `docs/implementation.md` ·
`docs/migration-notes.md` · `docs/adr/0000–0009`.

---

## 4. What has NOT been done

- ❌ Production migrations applied
- ❌ Pushed, PR opened, or merged
- ❌ Deployed
- ❌ Catalog synced to the database (/admin → Catalog → Sync this build)
- ❌ Migrations validated on real Supabase (only on PGlite)
- ❌ /admin panels exercised against live data (no local credentials)
- ❌ Any question tagged
- ❌ Any rule-based or learned policy (intentionally out of scope)

---

## 5. Recommended review order

1. **`docs/adr/0000-measures-conversations-not-engagement.md`**: the doctrine. Everything else should serve it.
2. **`docs/strategy.md`**: vision, principles, open questions Q1–Q8.
3. **`docs/adr/README.md` → ADRs 0001–0009**, especially 0002 (revisions), 0004 (baseline), 0006 (lifecycle), 0008 (outbox, no FKs).
4. **`docs/architecture/recommendation.md`**: the selection probability and evaluation reasoning.
5. **`docs/telemetry-spec.md`**: exactly what is recorded; confirm it matches your privacy expectations.
6. **Player-facing code:** `src/App.tsx` (diff against `main`), `src/onboarding.ts`, the About copy, `src/styles.css`. Confirm there are no gameplay changes beyond the welcome, star, About and home line.
7. **Deck and policy:** `src/deck.ts`, `src/recommendation/uniformRandom.ts`, `src/recommendation/types.ts`.
8. **Telemetry code:** `src/telemetry/tracker.ts`, `dwell.ts`, `outbox.ts`, `useCardTelemetry.ts`.
9. **Migrations:** the 4 new SQL files, then `docs/schema.md`.
10. **Admin:** `src/admin/Foundation.tsx`.
11. **Tests:** `test/db.test.ts` first (it shows the database behavior end to end), then the unit suites.
12. **`docs/migration-notes.md`**: deploy order and rollback, read last, just before deciding to ship.

Quick look at everything in a browser (dev never writes to Supabase):
```
npm run dev  →  http://localhost:5173/?qbflags=telemetryDebug&qbonboarding=reset
```
Then inspect `window.__sttTelemetry` in the console.

---

## 6. Known risks and open questions

1. Migrations are proven on PGlite (PG18), not on Supabase (PG17 + real auth). Validate on a Supabase branch before production.
2. Deploying the app before the migrations drops telemetry rows (404s are not retried).
3. Existing players will see the welcome once.
4. iOS often kills backgrounded pages silently, so many exits will be *inferred* (`research_impressions.exit_source`).
5. Two tabs share one outbox storage key; rare row loss is possible.
6. Append-only triggers must be disabled deliberately to remove abusive submitted text (procedure in `docs/migration-notes.md`).
7. Pre-existing quirk kept: the first card of a session can come round once more in the first pass (strategy Q6).
8. The player bundle is about 7.6 KB larger gzipped.
9. Undecided (strategy Q1–Q8): room-read friction, holdout size, outcome definition, AI-drafted questions, persistent groups, the first-card quirk, a server read for experimental questions, contributor credit.

---

## 7. Hard rules for the next session

- **Do not apply production migrations** unless the owner explicitly says so in that session.
- **Do not push, open a PR, merge, or deploy** unless explicitly asked.
- Never change a question id; never change what a telemetry field means; never store a derived score; never auto-promote content; never generate tags.
- The Supabase connector should point at **QB Production** (`wxvynkalkjrtygcjjyxy`). If it lists "Dado Production" instead, that is the wrong project; stop and tell the owner.

---

## 8. First prompt to give Claude tomorrow

Copy and paste:

> Read `SESSION_HANDOFF.md` at the repo root, then `docs/adr/0000-measures-conversations-not-engagement.md` and `docs/strategy.md`. Confirm we're on branch `feature/recommendation-foundation` with the implementation commit `b4439464bb1dd3c65da62c8a1a3b39321a4904cd`, run `npm test` and `npm run test:db`, and confirm (read-only) that QB Production still has only its original 7 migrations. Do not apply migrations, push, open a PR, or deploy. Then walk me through the review in the order listed in section 5 of the handoff, one step at a time, pausing after each step for my questions and decisions. Record any decisions I make in the decision log in `docs/strategy.md`.
