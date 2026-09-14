# Session handoff: recommendation foundation is live

**Written:** 2026-09-14, end of session
**For:** a brand-new Claude Code session with no memory of this work
**Repo:** `C:\Users\toddh\OneDrive\Documents\Question Bowl\question_bowl` (Sip the Tea, live at sipthetea.app)
**Phase:** Production rollout is complete. This file describes steady-state
operation and the one remaining owner-gated step — read this, not any older
handoff still lying around under a different name.

---

## 1. Where things stand — READ THIS FIRST

| | |
|---|---|
| **Branch** | `main` |
| **Merged** | `feature/recommendation-foundation` → `main`, via `--no-ff` merge commit (`3b530b0`), followed by an admin-dashboard UX pass. Both are on `main`; check `git log --oneline -5` for the exact current HEAD. |
| **Pushed** | Yes, `origin/main` matches local `main` as of this session's close. |
| **Deployed to Vercel** | **Yes.** This repo has continuous deployment — every push to `main` builds and deploys automatically (README.md). There is no separate manual "deploy" step; pushing `main` **is** deploying. |
| **Production DB migrations** | **All 4 applied to QB Production** (`wxvynkalkjrtygcjjyxy`), in order, this session. 11 migrations total now (7 original + 4 new). Verified: `exit_actions` = 8, `lifecycle_transitions` = 6, `admin_telemetry_health()` runs, security/performance advisors show nothing new or blocking. |
| **Telemetry** | **Confirmed flowing end-to-end on the live production site.** A real test session was played on `sipthetea.app/?qbtest=1` and every layer was verified directly in QB Production: `play_sessions`, `context_snapshots`, `card_impressions` (exact selection probabilities `1/113`, `1/112`), `card_exits`, `conversation_nominations`, `impression_feedback`, and the `research_impressions` / `research_nominations` / `research_sessions` views all resolved correctly against that real data — including one exit whose fallback-inferred behavior (ADR 0008) was exercised for real. Zero integrity problems (0 superseded exits, 0 orphaned impressions, 0 draws missing a probability) across all of QB Production. No runtime errors on the Vercel deployment. |
| **Admin dashboard** | Reworked this session as an operational dashboard (see §3). Verified by `tsc -b`, a full `npm run build`, and the existing test suite — **not** visually exercised against a live sign-in, because that needs the owner's own `/admin` password (see §2). |
| **Catalog Sync** | **Not yet run.** The one remaining step; needs the owner signed in at `/admin` (see §2). |
| **Tests at HEAD** | `npm test`: 34 deck + 58 unit pass · `npm run test:db`: 22 pass · `npm run build`: succeeds (needs `VITE_PRODUCTION_HOSTNAME` set locally; Vercel already has it). |

Verify on resume:
```bash
git branch --show-current
git log --oneline -5
npm test
npm run test:db
```
Also re-check (read-only) QB Production's migration list and Vercel's current
production deployment/commit before assuming anything above is still
true — this file describes state as of 2026-09-14.

---

## 2. The one thing only the owner can do: Catalog Sync

`/admin` → **Catalog** → **"Sync this build"** registers the ~430 questions,
their wordings, statuses and tags with the database. It has never been run.

**Why a Claude Code session can't do this:** signing in requires
`signInWithPassword({ email, password })` — a real admin password. The
underlying check, `is_admin()`, reads `auth.jwt() ->> 'email'`, which only a
genuine authenticated session can satisfy; there is no service-role or raw-
SQL shortcut that wouldn't also corrupt the audit trail these functions exist
to keep (every catalog and lifecycle change records a real person's email as
actor — ADR 0006). Don't attempt to work around this; ask the owner to run it
themselves, or do it live with them watching.

**This does not block anything already working.** Telemetry has no foreign-
key dependency on the catalog tables (ADR 0008) — proven this session by
writing real telemetry rows before Sync had ever run. Catalog Sync unblocks:
- the Catalog panel's "Registered in database" / "Tagged" tiles actually
  reflecting reality (they'll show 0 until Sync runs at least once)
- any future community-question tagging or lifecycle work
- Data Health's tiles reflecting the real, live-site numbers (right now they
  will show the one test session recorded above, once viewed through
  `/admin` rather than direct SQL)

**To do it:** sign in at `sipthetea.app/admin`, go to **Catalog**, click
**Sync this build**. Expect roughly 430 questions, 430 wordings and 430
statuses added, nothing skipped.

---

## 3. This session's second half: the admin dashboard as an operational tool

The owner asked for the admin dashboard to be reviewed and improved as an
*operational dashboard for managing Sip the Tea*, not as cosmetic polish.
Changes, all in `src/Admin.tsx`, `src/admin/Foundation.tsx`, `src/admin.css`:

- **Deck and Catalog merged** into one "Catalog" section (`CatalogPanel` in
  `Foundation.tsx` now takes a `deck: DeckSummary` prop built once in
  `Admin.tsx`). One header, one set of tiles (Base, Question packs,
  Challenges, Registered in database, Community shipped, Tagged), the
  question-pack/challenge breakdown tables, and the Sync button all live
  together — same information, one section instead of two.
- **"Most liked" and "Least liked" now require an actual majority.**
  Previously they were just "top 8 by percentage among rated questions,"
  which could include a 40%-positive question in "Most liked" if nothing
  else qualified. Now `mostLiked` filters to `positive_pct > 50` and
  `leastLiked` to `positive_pct < 50` before ranking; a 50/50 split belongs to
  neither. Each gets its own empty-state message ("No question has a
  positive/negative majority yet.") distinct from "nothing rated at all."
  The underlying `admin_ratings_by_question` RPC was already computing
  `positive_pct` correctly — this was a client-side filtering bug, not a
  database one; nothing in `supabase/migrations/` changed.
- **"Every rated question" collapses by default**, in a `<details>` matching
  "Every raw submission"'s existing pattern, with a count in the summary.
- **Reordered top-to-bottom by how actionable each section is**, not by
  fetch order: **Data health** (is anything broken) → **Community questions**
  (what needs a decision right now) → **Catalog** (registration status + the
  occasional Sync) → **Traffic** → **Engagement** → **Ratings by category** →
  **Content performance** → **Every raw submission** (collapsed, at the very
  bottom). Data Health and Community Questions used to be at the bottom of
  the page; they're now the first two things anyone sees.
- **Spacing**: `.adm-section__head` now carries its own `margin-bottom`
  (14px) uniformly, and `.adm-note--tight`'s old `-4px` top-margin squeeze is
  gone — this gives the Catalog "Sync this build" button and the Community
  Questions filter toggle the same breathing room the Traffic "All time /
  Today" toggle already had, by making that rhythm the one rule every section
  header follows rather than a special case.
- **Accessibility**: `aria-pressed` on every toggle-style button (All
  time/Today, Needs attention/Everything), `scope="col"` on every table
  header, `aria-busy` on the Traffic/Engagement tiles while "Today" is
  loading, and a focus ring on the new `<details>` triggers.
- **No behavior changed** beyond the Most/Least liked filtering fix above —
  every number still comes from the same RPCs, no migration was touched,
  nothing a player sees changed.

**Verified:** `tsc -b` clean, `npm run build` succeeds (with
`VITE_PRODUCTION_HOSTNAME` set), `npm test` and `npm run test:db` both still
fully green (no admin-dashboard test coverage exists; nothing here is
exercised by the test suite either way).
**Not verified:** actually signing into `/admin` and looking at it — that
needs the owner's password, which this session neither has nor should ever
ask for. **Take a look once you're in there**, especially the new tile count
in Catalog before and after running Sync (§2).

---

## 4. What was completed in the recommendation-foundation phase (for context)

- Question identity and revisions, recommendation policy contracts, play
  telemetry, tags, the community lifecycle, feature flags, three /admin
  panels — architecture reviewed against ADR-000 and ADR 0001–0009, approved,
  merged, migrated, and now proven live (see §1).
- Doctrine and strategy wording fixes from that review: ADR-000 principle 4
  (telemetry disclosure belongs in a Privacy Policy, not gameplay copy),
  `docs/strategy.md` (device-vs-group return caveat, derived-score wording
  aligned with ADR-000, Q1/Q2/Q6/Q7 resolved), `docs/telemetry-spec.md` (the
  iOS Safari storage-clearing caveat on `device_id`).
- Player-visible: the home line, the one-time welcome, the best-conversation
  star, the About page. Nothing about dealing, swiping, packs, consent,
  ratings or suggestions changed.

Full detail on the architecture itself: `docs/adr/0000-…` through `0009-…`,
`docs/architecture/recommendation.md`, `docs/strategy.md`,
`docs/telemetry-spec.md`, `docs/schema.md`, `docs/migration-notes.md`.

---

## 5. Known risks (unchanged from rollout, still true)

1. iOS backgrounds pages silently, so many exits are *inferred* rather than
   *reported* — confirmed working as designed during this session's live
   test, not a bug.
2. Two tabs share one outbox storage key; rare row loss is possible (ADR
   0008, accepted).
3. Removing abusive submitted text requires deliberately disabling an
   append-only trigger — procedure in `docs/migration-notes.md`, never a
   plain DELETE.
4. `docs/strategy.md` Q3 (the outcome definition), Q4 (AI-drafted questions),
   Q5 (persistent groups) and Q8 (contributor credit) remain genuinely open —
   none block operation.
5. 7 unindexed foreign keys and 21 currently-unused indexes flagged by the
   Supabase performance advisor — all on low-cardinality lookup tables or
   brand-new empty ones; cosmetic at current scale, not urgent.

---

## 6. Hard rules for the next session

- **Never sign into `/admin` or ask the owner for the admin password.** Ask
  them to run Catalog Sync themselves, or do it with them watching.
- Any push to `main` deploys automatically — treat "push main" and "deploy"
  as the same action; don't push without the go-ahead you'd want before a
  deploy.
- Never change a question id; never change what a telemetry field means;
  never store a derived score; never auto-promote content; never generate
  tags.
- The Supabase connector should point at **QB Production**
  (`wxvynkalkjrtygcjjyxy`). If it lists "Dado Production" instead, stop and
  tell the owner.

---

## 7. First prompt for the next session

Copy and paste:

> Read `SESSION_HANDOFF.md` at the repo root. Confirm `main`'s current HEAD, run `npm test` and `npm run test:db`, and confirm (read-only) QB Production's current migration list and Vercel's current production deployment/commit — don't assume this file is still accurate on either point. Then [describe what you want done next — e.g. "walk me through running Catalog Sync" or "let's tag the first batch of questions" or a new feature].
