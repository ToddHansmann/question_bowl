# Session handoff: engineering complete; one owner action remains

**Written:** 2026-09-14, end of session
**For:** a brand-new Claude Code session with no memory of this work
**Repo:** `C:\Users\toddh\OneDrive\Documents\Question Bowl\question_bowl` (Sip the Tea, live at sipthetea.app)
**Phase:** Production rollout is complete, verified end to end. **Catalog
Sync is the only remaining task, and it cannot be done by a Claude Code
session — see §2 for exactly why, not just that it's pending.**

---

## 1. Where things stand — READ THIS FIRST

| | |
|---|---|
| **Branch** | `main` |
| **Pushed** | Check `git log --oneline -5` for the current HEAD — don't trust a sha written into this file. |
| **Deployed to Vercel** | Every push to `main` deploys automatically. |
| **`admin_traffic` migration — applied and verified.** | `supabase/migrations/20260914220000_admin_traffic_engaged_visitors.sql` is live on QB Production. Confirmed by pulling the function's actual definition back from the database (`pg_get_functiondef`) and diffing it against the committed file — identical. Confirmed the underlying numbers are correct by replicating the query without the `is_admin()` gate: 3 engaged visitors (from 4 real `session_started` events — one visitor started more than one session), 88 unique visitors, 82 one-event visitors, 1 session completed. `/admin`'s Traffic section will show these correctly the next time an admin signs in. |
| **Historical analytics cleanup — done, from an earlier session.** | Two devices reclassified `is_test = true`. |
| **Test-device forward-fix — done this session.** | See §3: a dedicated install path now exists so a Home Screen icon can be permanently test-tagged. |
| **Catalog Sync — the one thing left, and a Claude Code session cannot do it. Not a permission setting; see §2.** | `question_catalog` and every related table are still 0 rows. |
| **Tests at HEAD** | `npm test`: 34 deck + 58 unit pass · `npm run test:db`: 22 pass (12 migrations, all applied to production now) · `npm run build`: succeeds. |

---

## 2. Why Catalog Sync specifically cannot be done by an assistant session

This isn't the same kind of blocker the migration was. The migration was
blocked by this session's own tool-permission classifier — a Claude Code
setting, and it went through cleanly on a later retry with no new grant
from the owner. **Catalog Sync is blocked by the database's own
authentication design, which no permission setting changes:**

`admin_sync_catalog` (like every editorial function) calls
`require_admin()`, which calls `is_admin()`, which checks
`auth.jwt() ->> 'email'`. That claim is populated by Supabase's API layer
(PostgREST) from a real signed-in session's Bearer token — it does not
exist in a raw database connection at all, regardless of what that
connection is otherwise allowed to do. A tool that can run arbitrary SQL
with full privileges (which is what a session has once permission is
granted) still cannot make `auth.jwt()` return an email, because nothing
ever sent one — there was no HTTP request with a token attached. This
would be true no matter how permissive the Claude Code tool-permission
model became; it is a property of how Supabase Auth works, not a setting.

**The only way to give an assistant that context would be to hand it the
owner's password or an active session token.** Both are declined,
deliberately, independent of what's technically possible:
- Entering or handling a password is not something this kind of session
  does under any grant of permission — it's excluded outright, the same
  way it would refuse to enter one into any other login form.
- A live session token would work technically (it's exactly what a
  browser sends), but using it would mean an assistant registers ~430
  questions and revisions under the owner's identity without the owner
  personally taking that action — which defeats the entire point of
  `admin_sync_catalog` requiring `require_admin()` in the first place
  (ADR 0006: "every transition is a person's decision," attributed to a
  real, accountable email in an append-only audit table). Forging that
  attribution would be worse than not syncing at all.
- There is no "impersonate this user" or "mint a session for this email"
  capability exposed through this session's Supabase tools, and it
  wouldn't be used even if there were, for the same reason.

**What it actually takes:** sign into `sipthetea.app/admin`, click
**Catalog → "Sync this build."** One click, under a second to run. Nothing
about this MVP's engineering is waiting on anything else.

---

## 3. Traffic metrics redesign (why, not just what)

**The investigation that triggered this:** the owner didn't believe 87
unique visitors was real, having shared the app with only a few friends.
Direct database investigation found: of 87 real visitor ids, **84 never
reached `session_started`**, and **at least 30 of those arrived within 10
seconds of another brand-new visitor id** — one pair 81 *microseconds*
apart. That's not humans; it's link-preview fetchers and crawlers hitting a
newly-public domain. See `docs/migration-notes.md`'s 2026-09-14 entries for
the full evidence trail.

**What changed:**
- `admin_traffic` (applied to production, §1) now leads with **`engaged_visitors`**
  — distinct visitor_id that reached `session_started` — as the number that
  actually answers "how many real people played."
- The old `unique_visitors` (any tracked event at all, landing page
  included) and a new `one_event_visitors` (entire history is one event —
  the likeliest bots) moved into a **collapsed Diagnostics section**,
  along with "Landing page loads" and a derived "Never reached the deck"
  tile. Closed by default; nothing there competes with the numbers that
  matter for judging adoption.
- **"Include test data" moved into that same Diagnostics section**, out of
  the always-visible header bar. It still controls exactly what it did
  before (every section on the page); it's just no longer competing for
  attention with the operational numbers. The "Exclude this device" toggle
  and the device-status badge stay in the header — they're about *this
  admin's own browser*, not a data-scope diagnostic, and are worth keeping
  at a glance.
- `src/Admin.tsx`'s local "Today" calculation (`loadDaily`, which reads raw
  tables directly rather than the RPC) was updated to compute
  `engaged_visitors` / `one_event_visitors` the same way, and a
  pre-existing small inconsistency was fixed in passing: it used to compute
  `unique_visitors` from only `app_opened` events; it now matches the RPC's
  definition (any event) exactly.

---

## 4. Test-device forward-fix: the Home Screen problem, closed without new UI

**The gap:** Device A (the owner's iPhone Home Screen install) generated
another real-tagged row *after* last session's historical cleanup — proving
the underlying reachability problem was still live, not just historical.
Neither `/admin`'s toggle nor a `?qbtest=` link can be used from inside an
already-installed standalone icon (no sign-in surface, no address bar), and
third-party reports are consistent that iOS partitions a Home Screen
install's storage separately from Safari's — though this remains
externally-corroborated, not verified against this exact device (see the
decisive test still on offer in the previous handoff's history if this ever
needs settling for certain).

**The fix — `public/manifest-test.webmanifest` + a few lines in
`src/analytics.ts`:** identical to the real manifest except its
`start_url` carries `?qbtest=1`. While a browser is already in test mode or
excluded, `useTestManifestIfWarranted()` swaps which manifest is linked
before the user could tap "Add to Home Screen" — so the resulting icon's
*launch itself* re-navigates through a URL that re-asserts test mode, every
single time, forever. No admin sign-in, no address bar, and — critically —
**nothing added to the UI a normal player would ever see**: a device that's
never been marked test or excluded gets the one real manifest, unchanged.
Guarded to never apply on `/admin`.

**To set it up (one-time, per device):**
1. **iPhone:** in Safari, visit `sipthetea.app/?qbtest=1`, then Share →
   Add to Home Screen. The resulting icon is named "Sip the Tea (Test)" so
   it's visually distinct from a normal install, and every launch from now
   on starts in test mode. If an existing, already-contaminating icon is
   still on the Home Screen, delete it and replace it with this one.
2. **Development laptop:** doesn't need this trick — a laptop browser
   doesn't have the standalone/Safari storage split at all. Sign into
   `/admin` from that laptop's normal browser once and confirm the header
   badge reads "Test" (it will, automatically, on sign-in) or check
   "Exclude this device" if you'd rather it send nothing. That already
   persists normally in a regular browser profile.

**Verified locally:** with `qb.testMode.v1` or `qb.excludeDevice.v1` set,
the manifest `<link>` swaps to `/manifest-test.webmanifest` (confirmed by
reading the DOM); on `/admin`, it never swaps regardless of those flags;
with neither flag set, the real manifest is untouched.

---

## 5. Hard rules for the next session

- **Never sign into `/admin` or ask the owner for the admin password —
  and never accept one if offered, even to unblock Catalog Sync.** See §2
  for exactly why that specific task can't be delegated around.
- Any push to `main` deploys automatically.
- Don't reclassify or delete telemetry/analytics rows without new evidence
  and the same quantify-first, verify-first discipline used earlier this
  project — and don't bypass an append-only trigger for that.
- Never change a question id; never change what a telemetry field means;
  never store a derived score; never auto-promote content; never generate
  tags.
- The Supabase connector should point at **QB Production**
  (`wxvynkalkjrtygcjjyxy`). If it lists "Dado Production" instead, stop and
  tell the owner.

---

## 6. What remains before beta vs. after

**Required before beta, and cannot be done by a Claude Code session (§2):**
- Catalog Sync (`/admin` → Catalog → "Sync this build") — one click, once
  signed in. Everything else engineering could do is done.

**Recommended, not blocking:**
- Set up the dedicated test Home Screen icon (§4) so this doesn't recur.
- Tag the ~430 questions by hand once Catalog Sync has run.
- Watch Data Health and the new Engaged-visitors number for a week of real
  traffic.

**Future roadmap:** `docs/strategy.md` Q3/Q4/Q5/Q8, Stage 2 of the
roadmap, minor DB index advisories — none beta-relevant.

---

## 7. First prompt for the next session

Copy and paste:

> Read `SESSION_HANDOFF.md` at the repo root. Confirm `main`'s current HEAD, run `npm test` and `npm run test:db`, and confirm (read-only) whether Catalog Sync has been run yet (`select count(*) from question_catalog` — 0 means not yet). Then [describe what you want done next].
