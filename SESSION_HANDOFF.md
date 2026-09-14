# Session handoff: recommendation foundation is live and clean

**Written:** 2026-09-14, end of session
**For:** a brand-new Claude Code session with no memory of this work
**Repo:** `C:\Users\toddh\OneDrive\Documents\Question Bowl\question_bowl` (Sip the Tea, live at sipthetea.app)
**Phase:** Production rollout is complete. The analytics-pollution fix from
earlier sessions is now applied and verified. **Catalog Sync is the one
remaining owner-gated step before beta**, and nothing else blocks it.

---

## 1. Where things stand — READ THIS FIRST

| | |
|---|---|
| **Branch** | `main` |
| **Pushed** | Yes, `origin/main` matches local `main`. Run `git log --oneline -5` — don't trust a sha in this file to still be current. |
| **Deployed to Vercel** | **Yes.** Every push to `main` builds and deploys automatically. |
| **Production DB migrations** | All 4 recommendation-foundation migrations applied. 11 total. |
| **Telemetry** | Flowing end-to-end, verified multiple times against real production writes. |
| **Data cleanup — done** | Two testing devices reclassified `is_test = true` (see §2). Real KPIs now read 87 unique visitors, 4 sessions started, 1 session completed, 8 ratings — verified before and after the change. |
| **Device exclusion — verified end-to-end this session** | Set `qb.excludeDevice.v1` before mount on the live production site, played a full session (deck, nominate, attempted rate) — confirmed zero new rows in `analytics_events`, `play_sessions`, `card_impressions`, and `conversation_nominations`. The mechanism itself works correctly; the only historical problem was reachability from an iOS Home Screen install (see §3 for the honesty caveat on that specific claim). |
| **Catalog Sync — NOT done.** | Verified directly: `question_catalog`, `question_revisions`, `question_lifecycle_events`, `question_tag_assignments`, `tag_dimensions` are all **empty (0 rows)**. Nobody has signed into `/admin` and clicked "Sync this build." This is the one remaining owner-gated task — see §4. |
| **Tests at HEAD** | `npm test`: 34 deck + 58 unit pass · `npm run test:db`: 22 pass · `npm run build`: succeeds (needs `VITE_PRODUCTION_HOSTNAME` set locally). |

---

## 2. Data cleanup: done, exact scope

**Devices reclassified:** `6c1bf8c6-87e0-4834-ac2f-f1d7f2da1b15` and
`d6e9a640-fcfa-4f74-9408-da351d27b281` — 88 rows in `analytics_events`, 1
row in `question_ratings`. Nothing was deleted; only `is_test` flipped
`false → true`. Full reasoning, evidence, and the exact statements are in
this file's git history (see the commit around 2026-09-14 titled
"Move tester-device management to /admin; quantify pollution fix") and in
`docs/migration-notes.md`'s change log.

**Deployment-timing evidence** (found this session, stronger than the
original identification): both devices repeatedly arrived within 30
seconds to a few minutes of a specific production deploy, across multiple
separate days — a pattern no coincidental real visitor would produce
repeatedly. Device A also carries direct technical evidence
(`display_mode: standalone` on its `play_sessions` row). Device B's entire
activity window (2026-09-09/10) predates any Claude Code session's first
interaction with this production site (2026-09-14), which rules out that
device being Claude's own verification activity.

**Real KPIs, before → after:** 89→87 unique visitors, 35→4 sessions
started, 14→1 sessions completed, 9→8 ratings. `all_unique_visitors`
stayed 96 throughout — confirming "Include test data" still recovers
everything; nothing was lost.

**Not touched, deliberately:** `play_sessions`, `context_snapshots`,
`card_impressions`, `card_visibility_events`, `card_exits` for these
devices — protected by append-only triggers whose only documented
exception is removing abusive content. The cost of leaving them is small:
Device A's contribution there is 1 `play_sessions` row and single-digit
impressions.

---

## 3. Honesty note on the Home Screen storage claim

Earlier sessions asserted "iOS Home Screen installs use separate storage
from Safari" as settled fact. **That was an inference from general
technical knowledge, not something verified against this application** —
there's no iPhone in this environment, and no user-agent/platform field is
captured in our telemetry (deliberately, for privacy) that could prove it
empirically. This session found current, consistent third-party
documentation corroborating the claim (multiple independent 2025–2026
developer sources, e.g. a widely-cited technical writeup stating "Session,
cookies, local storage, and even Service Worker instance is not shared
between safari and standalone mode") — but that's still third-party
reporting, not a first-party test.

**A decisive, first-party test the owner can run in under a minute, if this
ever needs re-litigating:** sign into `/admin` from Safari, turn on
"Exclude this device" (the status badge will confirm), then open the
*already-installed* Home Screen icon and play a card. If that session
still lands `is_test = false`, the two contexts don't share storage,
confirming the theory for this exact device. If it lands `is_test = true`,
storage is shared and the earlier pollution had a different, simpler cause
(most likely: the flag simply hadn't been set anywhere yet).

**No product code depends on this claim.** No automated
"detection-and-reclassification" mechanism was built or is planned — the
correction in §2 was a one-time manual action, done once, with the same
evidence-first discipline each time, not a recurring system.

---

## 4. Catalog Sync — what's left and what depends on it

**What remains:** sign into `sipthetea.app/admin` → **Catalog** → click
**"Sync this build."** Needs the owner's own admin password; Claude Code
sessions must never ask for it or attempt to work around the requirement
(the function requires a real authenticated JWT — `is_admin()` checks
`auth.jwt() ->> 'email'`, which no service-role connection can satisfy
without corrupting the audit trail the editorial functions exist to keep).

**Expected result:** roughly 430 questions, 430 wordings, and 430 status
events added; the Catalog panel's tiles (currently reading 0) will show
real numbers.

**What depends on it:**
- Tagging any question (`question_tag_assignments` needs `tag_dimensions`
  registered first, which Sync does).
- Any lifecycle transition on an editor-authored question (experimental →
  canon, archiving) — there's no status row to transition *from* until
  Sync creates one.
- The Catalog panel's own displayed numbers.

**What does NOT depend on it** — confirmed working without it: play
telemetry (`play_sessions`, `card_impressions`, etc. — no foreign key to
the catalog tables, per ADR 0008), the deck itself, ratings, suggestions,
the community-question review queue's early stages (a submission can be
accepted into Draft without Sync ever having run — Draft rows are created
directly by `admin_review_submission`, not by Sync).

---

## 5. What's required before beta vs. recommended vs. future roadmap

**Required before beta:**
- Catalog Sync (§4) — nothing else is blocking.

**Recommended, but not blocking beta:**
- Tag the ~430 questions by hand (`src/catalog/questionTags.ts`) — needs
  Sync first. Coverage can grow gradually; the dashboard already shows a
  "Tagged" count once Sync has run.
- Watch Data Health for a week of real traffic to confirm exit-reporting
  and integrity numbers behave as expected at real volume (only ever
  tested at very small scale so far).
- If the Home Screen storage question ever matters again in practice, run
  the decisive test in §3 before building anything around it.

**Future roadmap (not beta-relevant at all):**
- `docs/strategy.md` open questions Q3 (outcome definition), Q4
  (AI-drafted questions), Q5 (persistent groups), Q8 (contributor credit).
- Stage 2 of the roadmap (rule-based recommendations) — gated on real
  usage volume and tagging coverage per `docs/roadmap.md`.
- Minor Supabase performance advisories (unindexed FKs on low-cardinality
  lookup tables, unused indexes) — cosmetic at current scale.

---

## 6. Hard rules for the next session

- **Never sign into `/admin` or ask the owner for the admin password.**
- Any push to `main` deploys automatically.
- Don't reclassify or delete any further telemetry/analytics rows without
  new evidence and the same quantify-first, verify-first discipline used
  in §2 — and don't bypass an append-only trigger for this class of
  correction.
- Don't assert the Home Screen storage-isolation claim as settled fact
  without re-reading §3 first.
- Never change a question id; never change what a telemetry field means;
  never store a derived score; never auto-promote content; never generate
  tags.
- The Supabase connector should point at **QB Production**
  (`wxvynkalkjrtygcjjyxy`). If it lists "Dado Production" instead, stop and
  tell the owner.

---

## 7. First prompt for the next session

Copy and paste:

> Read `SESSION_HANDOFF.md` at the repo root. Confirm `main`'s current HEAD, run `npm test` and `npm run test:db`, and confirm (read-only) QB Production's current migration list, whether Catalog Sync has been run (`select count(*) from question_catalog`), and current real-visitor KPI numbers — don't assume this file is still accurate on any of those. Then [describe what you want done next].
