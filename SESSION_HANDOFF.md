# Session handoff: recommendation foundation is live; one data fix pending

**Written:** 2026-09-14, end of session
**For:** a brand-new Claude Code session with no memory of this work
**Repo:** `C:\Users\toddh\OneDrive\Documents\Question Bowl\question_bowl` (Sip the Tea, live at sipthetea.app)
**Phase:** Production rollout is complete. One data-quality fix is fully
diagnosed and specified but **not yet applied** — it needs a permission this
session didn't have. Read this file, not any older handoff under a
different name.

---

## 1. Where things stand — READ THIS FIRST

| | |
|---|---|
| **Branch** | `main` |
| **Pushed** | Yes, `origin/main` matches local `main` as of this session's close. Run `git log --oneline -5` — don't trust a sha in this file to still be current. |
| **Deployed to Vercel** | **Yes.** Every push to `main` builds and deploys automatically. Pushing `main` **is** deploying. |
| **Production DB migrations** | All 4 recommendation-foundation migrations applied. 11 total. |
| **Telemetry** | Confirmed flowing end-to-end. |
| **⚠️ Two devices are still polluting real production KPIs** | See §2. Root cause diagnosed, exact fix specified, **blocked on a permission this session didn't have** — needs either the owner running two `UPDATE` statements themselves, or a future session with write access to Supabase data (not just schema). |
| **Admin dashboard** | Content performance is cards; a device-status badge ("This device: Production / Test / Excluded") now sits in the `/admin` header bar. See §3. |
| **The public "mark this device as a tester" control from last session has been removed.** Tester-device management is `/admin`-only again, by the owner's explicit direction. This reopens the original reachability gap for an iOS Home Screen install — see §3's note on that tradeoff. |
| **Tests at HEAD** | `npm test`: 34 deck + 58 unit pass · `npm run test:db`: 22 pass · `npm run build`: succeeds (needs `VITE_PRODUCTION_HOSTNAME` set locally). |

---

## 2. Analytics pollution: diagnosis is done, the fix is not applied

### Confirmed root cause (unchanged from last session, re-verified)

iOS treats a Home Screen install as a storage context separate from Safari
for the same origin. `/admin`'s "Exclude this device" checkbox and the
`?qbtest=` URL param both write to `localStorage`, and both can only
realistically be reached from a Safari tab — a Home Screen install has no
address bar. `public/manifest.webmanifest` also declares a fixed
`"start_url": "/"`, so re-adding the icon from a URL carrying `?qbtest=1`
doesn't help on a spec-compliant Safari either. **The exclusion mechanism
itself works correctly wherever it's reachable** — verified again this
session that `is_test` filtering is consistent across `admin_traffic`,
`admin_engagement`, `admin_telemetry_health`, and the telemetry pipeline.
The bug has only ever been reachability from a standalone install, not the
filtering logic.

### Two specific devices, identified with quantified evidence

**Device A — `6c1bf8c6-87e0-4834-ac2f-f1d7f2da1b15`.** Its one
`play_sessions` row (2026-09-14) records `display_mode: "standalone"` —
direct technical proof it was played from an installed Home Screen app,
not an inference. Active across 4 separate days spanning the whole beta
(Sep 10, 11, 13, 14); 31 `analytics_events`, 6× the next-most-active real
visitor (5). Contributes **10 of 35** real `sessions_started` and **2 of
14** real `sessions_completed`.

**Device B — `d6e9a640-fcfa-4f74-9408-da351d27b281`.** Missed in the
previous pass — actually the single most active "real" visitor in the
dataset: 55 `analytics_events`, all within one 23-hour window on launch
day (2026-09-09–10, before recommendation-foundation telemetry existed, so
no `display_mode` evidence is possible for it either way). **21 separate
`session_started` events in 23 hours** — restarting the app ~21 times in a
day is a reload-and-check pattern, not how a real player behaves — and
**zero ratings ever**, unusual for someone who opened the app 21 times if
they were actually enjoying it (9 of the other 88 real visitors rated
something). Contributes **21 of 35** real `sessions_started` (60%) and
**11 of 14** real `sessions_completed` (78.6%).

Neither identification is certain — this architecture deliberately infers
nothing about identity from behavior — but both are extreme outliers
separated from the rest of the real-visitor distribution by a wide margin
(55, 31, then 5, 4, 2, 1…), and Device A has a hard technical fact
corroborating it. No other visitor was touched or considered; everyone
else's numbers are ordinary.

**Combined impact if reclassified:** real `sessions_started` 35 → **4**,
real `sessions_completed` 14 → **1**, real unique visitors 89 → **87**,
real ratings 9 → **8**. This is a large correction — most of what the
dashboard currently shows as "beta activity" is these two devices'
testing, not real players.

### What was and wasn't done

`analytics_events` and `question_ratings` have **no** append-only trigger
— an `UPDATE` is architecturally safe there. `play_sessions`,
`context_snapshots`, `card_impressions`, `card_visibility_events`, and
`card_exits` **do** have append-only triggers that reject any update or
delete outright, even for a superuser, specifically so telemetry history
can't be quietly rewritten — confirmed directly against
`information_schema.triggers`. The only documented exception to that
protection (`docs/migration-notes.md`, "Operational notes") is removing
genuinely abusive submitted text — not a routine reclassification like
this one. **I chose not to bypass that protection.** Practically the cost
is small: Device A has only 1 `play_sessions` row and single-digit
`card_impressions`/`card_exits`, which won't visibly skew Data Health at
current volume.

**Attempting the two safe `UPDATE`s failed** — the execute_sql call was
blocked by this session's own permission system ("Modify Shared
Resources"), which is a guardrail on this Claude Code session, not a
database or architecture restriction. **Nothing was changed.** The exact
statements, ready to run (Supabase SQL editor, or `execute_sql` in a
session with the right permission):

```sql
update public.analytics_events
set is_test = true
where visitor_id in ('6c1bf8c6-87e0-4834-ac2f-f1d7f2da1b15', 'd6e9a640-fcfa-4f74-9408-da351d27b281')
  and is_test = false;

update public.question_ratings
set is_test = true
where visitor_id = '6c1bf8c6-87e0-4834-ac2f-f1d7f2da1b15'
  and is_test = false;
```

After running these, re-check `admin_traffic`/`admin_engagement` (or the
equivalent direct-SQL counts above) to confirm the real numbers land at
the quantified values above, and note the change in
`docs/migration-notes.md`'s change log, matching the project's existing
practice for this kind of correction.

---

## 3. Admin dashboard and About page changes

- **Removed** the "Mark this device as a tester" control from the
  player-facing About page (was added last session, in `src/App.tsx`).
  The owner's explicit direction: tester-device management should live
  only in `/admin`, behind sign-in — not in the game itself, even quietly.
  **Known tradeoff, accepted by the owner:** this reopens the original
  problem for an iOS Home Screen install — `/admin` is unreachable from a
  standalone context (no address bar, can't sign in), so a device in that
  state still can't mark itself. The forward-looking answer, if this comes
  up again, is periodic detection-and-reclassification (§2's method) rather
  than a prevention mechanism in the player bundle.
- **Added** a device-status badge to `/admin`'s header bar: "This device:
  Production / Test / Excluded," color-coded, reflecting the *current
  admin browser's* own recording state (`isTestMode()` /
  `isDeviceExcluded()`, both already existing mechanisms — nothing new
  underneath, just made visible). Sign-in already auto-enables test mode
  for the admin's own browser; this badge is the "clearly indicate" the
  owner asked for.
- Content performance cards, the Most/Least-liked majority fix, and the
  Community Questions wording fix from last session are unchanged and
  still in place — confirmed, not re-touched, since they already satisfy
  what was re-asked this round.

**Verified:** `tsc -b` clean, full `npm run build` succeeds, `npm test`
and `npm run test:db` unchanged and green. Removal of the About-page
control was exercised in a local dev server — confirmed the block is
gone from the rendered DOM and no console errors.

---

## 4. Hard rules for the next session

- **Never sign into `/admin` or ask the owner for the admin password.**
- Any push to `main` deploys automatically.
- **Do not reclassify or delete any other telemetry/analytics rows**
  beyond the two devices and two tables specified in §2 without new
  evidence and the same quantify-first discipline — and don't bypass an
  append-only trigger for this class of correction; that protection is
  deliberate.
- Never change a question id; never change what a telemetry field means;
  never store a derived score; never auto-promote content; never generate
  tags.
- The Supabase connector should point at **QB Production**
  (`wxvynkalkjrtygcjjyxy`). If it lists "Dado Production" instead, stop and
  tell the owner.

---

## 5. What remains

- **Run the two `UPDATE` statements in §2** — the one concrete unfinished
  item from this session.
- **Catalog Sync** (`/admin` → Catalog → "Sync this build") has never been
  run — needs the owner signed in.
- Tag the ~430 questions by hand (`src/catalog/questionTags.ts`).
- `docs/strategy.md` Q3, Q4, Q5, Q8 remain genuinely open.
- Minor Supabase performance advisories (unindexed FKs, unused indexes) —
  cosmetic at current scale.

---

## 6. First prompt for the next session

Copy and paste:

> Read `SESSION_HANDOFF.md` at the repo root. Confirm `main`'s current HEAD, run `npm test` and `npm run test:db`, and confirm (read-only) QB Production's current migration list, current real-visitor KPI numbers, and Vercel's current production deployment/commit — don't assume this file is still accurate on any of those. If the two `UPDATE` statements in §2 haven't been run yet, ask me whether to run them now. Then [describe what you want done next].
