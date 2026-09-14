# Session handoff: dashboard redesigned around real engagement

**Written:** 2026-09-14, end of session
**For:** a brand-new Claude Code session with no memory of this work
**Repo:** `C:\Users\toddh\OneDrive\Documents\Question Bowl\question_bowl` (Sip the Tea, live at sipthetea.app)
**Phase:** Production rollout is complete. **One migration is written,
tested, and ready, but not yet applied to QB Production** — until it is,
`/admin`'s Traffic section will show incorrect numbers. This is the one
concrete thing left to do; nothing else blocks beta.

---

## 1. Where things stand — READ THIS FIRST

| | |
|---|---|
| **Branch** | `main` |
| **Pushed** | Check `git log --oneline -5` for the current HEAD — don't trust a sha written into this file. |
| **Deployed to Vercel** | Every push to `main` deploys automatically. |
| **⚠️ A migration is pending, and the deployed code already expects it** | `supabase/migrations/20260914220000_admin_traffic_engaged_visitors.sql` replaces `admin_traffic`'s return shape. It's authored, and `npm run test:db` proves it applies cleanly and behaves correctly on PGlite — but applying it to QB Production was **blocked by this session's own permission system** ("Blind Apply"), not by the database. **Until someone applies it, `/admin`'s "Engaged visitors" and "One-event visitors" tiles will silently read 0** (the RPC just won't have those columns yet) — nothing crashes, no player-facing effect, but the numbers are wrong until this runs. See §2 for the exact fix. |
| **Historical analytics cleanup — done, from the previous session** | Two devices reclassified `is_test = true` (88 `analytics_events` rows, 1 `question_ratings` row). Real KPIs: 87 unique visitors, 4 sessions started, 1 completed, 8 ratings, as of that reclassification. |
| **Test-device forward-fix — done this session** | See §3: a dedicated install path now exists so a Home Screen icon can be permanently test-tagged without touching `/admin` or exposing any control to normal players. |
| **Tests at HEAD** | `npm test`: 34 deck + 58 unit pass · `npm run test:db`: 22 pass (12 migrations now, including the pending one — it's proven correct on PGlite even though production hasn't received it yet) · `npm run build`: succeeds. |

---

## 2. The one required action: apply the pending migration

**Run this in the Supabase SQL editor against QB Production**
(`wxvynkalkjrtygcjjyxy`), or via `apply_migration` in a session that has
permission for it — the exact contents of
`supabase/migrations/20260914220000_admin_traffic_engaged_visitors.sql`:

```sql
drop function if exists public.admin_traffic(boolean);

create function public.admin_traffic(include_test boolean default false)
returns table (
  engaged_visitors   bigint,
  unique_visitors    bigint,
  one_event_visitors bigint,
  sessions_opened    bigint,
  sessions_started   bigint,
  sessions_completed bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with scoped as (
    select *
    from public.analytics_events e
    where public.is_admin() and (include_test or not e.is_test)
  ),
  per_visitor as (
    select
      visitor_id,
      count(*) as n_events,
      count(*) filter (where name = 'session_started') as n_started
    from scoped
    group by visitor_id
  )
  select
    (select count(*) from per_visitor where n_started > 0),
    (select count(*) from per_visitor),
    (select count(*) from per_visitor where n_events = 1),
    (select count(distinct session_id) from scoped where name = 'app_opened'),
    (select count(distinct session_id) from scoped where name = 'session_started'),
    (select count(distinct session_id) from scoped where name = 'session_completed');
$$;

revoke all on function public.admin_traffic(boolean) from public, anon;
grant execute on function public.admin_traffic(boolean) to authenticated;
```

**After running it**, sign into `/admin` and confirm "Engaged visitors"
shows a real number (expect around 4, matching `sessions_started` from the
last reclassification — most engaged visitors so far have started exactly
one session) and the Diagnostics section's "Unique visitors" /
"One-event visitors" tiles populate correctly.

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
- `admin_traffic` (pending migration, §2) now leads with **`engaged_visitors`**
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

- **Never sign into `/admin` or ask the owner for the admin password.**
- Any push to `main` deploys automatically.
- **Apply the pending migration (§2) before trusting `/admin`'s Traffic
  numbers**, and don't assume a previous session's "blocked" note is still
  accurate — check `select count(*) from information_schema.routines where
  routine_name = 'admin_traffic'` won't tell you the shape; instead run
  `select * from public.admin_traffic()` as an admin, or check whether
  `engaged_visitors` comes back, to know if it's already applied.
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

**Required before beta:**
- Apply the pending migration (§2).
- Catalog Sync (`/admin` → Catalog → "Sync this build") — still never run;
  needs the owner signed in. Verified directly: `question_catalog` and
  every related table are still 0 rows.

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

> Read `SESSION_HANDOFF.md` at the repo root. Confirm `main`'s current HEAD, run `npm test` and `npm run test:db`, and confirm (read-only) whether the `admin_traffic_engaged_visitors` migration has been applied to QB Production yet (call `admin_traffic()` as an admin, or check for `engaged_visitors` in its result) and whether Catalog Sync has been run (`select count(*) from question_catalog`) — don't assume this file is still accurate on either point. Then [describe what you want done next].
