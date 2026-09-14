# Session handoff: recommendation foundation is live and operational

**Written:** 2026-09-14, end of session
**For:** a brand-new Claude Code session with no memory of this work
**Repo:** `C:\Users\toddh\OneDrive\Documents\Question Bowl\question_bowl` (Sip the Tea, live at sipthetea.app)
**Phase:** Production rollout is complete, admin operations are cleaned up.
This file describes steady-state operation — read this, not any older
handoff still lying around under a different name.

---

## 1. Where things stand — READ THIS FIRST

| | |
|---|---|
| **Branch** | `main` |
| **Pushed** | Yes, `origin/main` matches local `main` as of this session's close. Run `git log --oneline -5` to see the exact current HEAD — don't trust a commit sha written into this file to still be current. |
| **Deployed to Vercel** | **Yes.** This repo has continuous deployment — every push to `main` builds and deploys automatically (README.md). There is no separate manual "deploy" step; pushing `main` **is** deploying. |
| **Production DB migrations** | All 4 recommendation-foundation migrations applied to QB Production (`wxvynkalkjrtygcjjyxy`). 11 total (7 original + 4 new). |
| **Telemetry** | Confirmed flowing end-to-end on the live site in an earlier session (real test session played, every table and view checked directly in production). |
| **Admin dashboard** | Reworked twice this project: once into an actionability-ordered operational dashboard, and again this session to fix a real analytics-pollution bug and redesign Content performance as expandable count cards. See §2 and §3. |
| **A device-marking control now exists in the game itself** | `/admin`'s "Exclude this device" toggle can only be reached from a Safari tab, which is a different storage partition than an iOS "Add to Home Screen" install of the same site — so an admin's own installed icon could never be marked as a tester before this session. The hamburger menu → **About Sip the Tea** now has a quiet "Mark this device as a tester" control that works from wherever it's tapped, home-screen icon included. See §2. |
| **Tests at HEAD** | `npm test`: 34 deck + 58 unit pass · `npm run test:db`: 22 pass · `npm run build`: succeeds (needs `VITE_PRODUCTION_HOSTNAME` set locally; Vercel already has it). No React component tests exist in this repo (never have) — the admin dashboard changes were verified by `tsc -b`, a full build, and manual browser verification, not by an automated UI test. |

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

## 2. Analytics pollution: root cause, fix, and one unresolved question

### What was wrong

The owner reported that their own device kept showing up in production
metrics (Unique visitors, Sessions started) despite "Exclude this device
from analytics" being on, and asked whether an iOS Safari Home Screen
install was involved.

**Confirmed root cause:** iOS treats a page added to the Home Screen
(`display: standalone` in `public/manifest.webmanifest`) as a *separate
browsing context with its own storage*, isolated from Safari's own
storage for the same origin. Every existing way to mark a device as
excluded or as a tester — the `/admin` checkbox, and the `?qbtest=` URL
param — writes to `localStorage`, and both can only realistically be
reached from a Safari tab (the `/admin` dashboard needs sign-in; a
`?qbtest=` link needs an address bar to type or paste into, which a
standalone install doesn't have). Worse, `manifest.webmanifest` declares
a fixed `"start_url": "/"`, so even re-adding the Home Screen icon from a
URL carrying `?qbtest=1` doesn't help on a modern, spec-compliant Safari —
the reinstalled icon still launches to the fixed `start_url`, discarding
whatever query string was on the page when it was added. **The flag had
no way to reach the one context that needed it.**

Verified directly against production data (`analytics_events`,
`play_sessions`): `is_test` is being set correctly by every pipeline that
already reaches it — my own verification session earlier this project
(`?qbtest=1` in a fresh browser) landed with `is_test = true` everywhere,
proving the flag mechanism and the RPC filtering (`admin_traffic`,
`admin_engagement`, `admin_telemetry_health`, etc.) are internally
consistent. The bug was reachability, not the filtering logic.

**Circumstantial evidence of the actual pollution:** one `visitor_id`
(`6c1bf8c6-87e0-4834-ac2f-f1d7f2da1b15`) accounts for 31 of the non-test
`analytics_events` rows across 2026-09-10 through 2026-09-14 — the most
active real visitor in the dataset by a wide margin, with continuous
activity spanning the whole beta period and including `onboarding_shown`
/ `onboarding_completed` (each of which otherwise has exactly one non-test
occurrence total). This is consistent with the owner's own repeated
personal testing, but **it is not certain** — a single very engaged early
beta tester is also a plausible explanation, and nothing in this
architecture infers identity from behavior (deliberately, per
`docs/adr/0000-…`). I did not reclassify or delete this device's rows.

### The fix (implemented, forward-looking)

`src/App.tsx`: the hamburger menu's **About Sip the Tea** page now has a
small, quietly-styled control at the bottom — "Testing the app on your own
device? Mark this device as a tester" — that calls the exact same
`isTestMode`/`setTestMode` functions `/admin` already used
(`src/analytics.ts`, unchanged). Because it's part of the game itself, it
runs in whatever storage context is currently hosting the game, standalone
Home Screen install included. This is additive: `/admin`'s own toggle,
auto-test-mode-on-sign-in, and `?qbtest=` all still work exactly as before.
No new tables, no new flags, no new architecture — just a second, reachable
door into a mechanism that already existed and was already filtered
correctly everywhere downstream.

**To actually stop counting the owner's Home Screen sessions:** open the
installed icon, hamburger menu → About Sip the Tea → "Mark this device as
a tester." One tap, permanent until unmarked from the same place.

### Left for the owner to decide

**Should the historical rows from `6c1bf8c6-87e0-4834-ac2f-f1d7f2da1b15`
(and any other device the owner recognizes as their own) be reclassified
to `is_test = true`?** I did not do this without confirmation — it's a
one-way edit to real historical rows based on a strong but not certain
match, and the instruction that authorized this work explicitly asked for
rows to be reclassified only once "safely identified." If the owner
confirms that visitor_id is theirs, the fix is a plain `update
analytics_events set is_test = true where visitor_id = '…'` (and the
equivalent on any `play_sessions`/`card_impressions`/etc. rows once telemetry
volume from that device grows) — small, reversible, and not something to
do without that confirmation first.

---

## 3. This session's other admin dashboard changes

- **Content performance is now cards, not always-open tables.** Most
  liked, Least liked, Most polarizing, and Every rated question are each a
  `<details className="adm-card">` styled like the tile design used
  everywhere else on the dashboard — closed, it's just a count and a label
  ("Most liked" / "12"); opening it reveals the full table for every
  question in that count. No more separate "show 3, then show N more"
  pagination (`ExpandableQuestionTable` was removed entirely) — a card is
  either collapsed or fully open.
- **Most polarizing now requires votes on both sides.** Previously it
  ranked by the polarization formula alone and padded a fixed-length list
  with whatever was left, which — with a young beta's sparse ratings —
  could include a one-sided question (all up or all down) purely to fill
  the list, even though that scores 0 on the formula (the least polarizing
  value possible). It now filters to `thumbs_up > 0 AND thumbs_down > 0`
  before ranking. Most liked / Least liked kept their majority filter from
  the previous session's fix (`positive_pct > 50` / `< 50`); none of the
  three lists are capped at a fixed length anymore — the card's count is
  the real, full count.
- **Community Questions wording now matches the architecture.** "Accept as
  draft" read as "accept exactly as submitted." It's now "Accept as
  editable draft," and the section's intro paragraph explicitly says
  accepting creates an editable draft under a permanent id while the
  original submission stays on record untouched (already true per ADR
  0006 — this is a wording fix, not a behavior change). The wording prompt
  itself was tightened to the same effect.
- Removed now-dead CSS (`.adm-expand`, `.adm-details`) left over from the
  pattern the cards replaced.

**Verified:** `tsc -b` clean, full `npm run build` succeeds, `npm test` and
`npm run test:db` unchanged and fully green. The new About-page tester
toggle was exercised in a local dev server (mobile viewport) — confirmed
`qb.testMode.v1` flips in `localStorage` and the button/note text update
correctly in both directions. The admin dashboard's card redesign was
**not** exercised against a live `/admin` sign-in — that still needs the
owner's own password, which this session neither has nor should ever ask
for.

---

## 4. Hard rules for the next session

- **Never sign into `/admin` or ask the owner for the admin password.**
- Any push to `main` deploys automatically — treat "push main" and
  "deploy" as the same action; don't push without the go-ahead you'd want
  before a deploy.
- **Never reclassify or delete existing telemetry/analytics rows without
  the owner explicitly confirming which device/visitor they belong to.**
  See §2's open question — it's still open until the owner answers it.
- Never change a question id; never change what a telemetry field means;
  never store a derived score; never auto-promote content; never generate
  tags.
- The Supabase connector should point at **QB Production**
  (`wxvynkalkjrtygcjjyxy`). If it lists "Dado Production" instead, stop and
  tell the owner.

---

## 5. What remains (all non-blocking)

- **Catalog Sync** (`/admin` → Catalog → "Sync this build") has never been
  run — needs the owner signed in. Doesn't block telemetry (no FK
  dependency, ADR 0008), only the catalog/tagging/lifecycle side of things.
- The historical-data reclassification question in §2.
- Tag the ~430 questions by hand (`src/catalog/questionTags.ts`).
- `docs/strategy.md` Q3 (outcome definition), Q4 (AI-drafted questions), Q5
  (persistent groups), Q8 (contributor credit) remain genuinely open.
- 7 unindexed foreign keys and unused indexes flagged by the Supabase
  performance advisor — cosmetic at current scale.

---

## 6. First prompt for the next session

Copy and paste:

> Read `SESSION_HANDOFF.md` at the repo root. Confirm `main`'s current HEAD, run `npm test` and `npm run test:db`, and confirm (read-only) QB Production's current migration list and Vercel's current production deployment/commit — don't assume this file is still accurate on either point. Then [describe what you want done next].
