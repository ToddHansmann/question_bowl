# Sip the Tea

One question, the whole screen. Made for a table of people answering out loud.

Opens on a branded start screen; one tap on **Pour the first question** drops you
into the deck.

- **Swipe left** — a new question you haven't seen
- **Swipe right** — back through everything you've already had
- **Arrow keys** work too, on a laptop
- 👍 / 👎 below the question rate it, once each
- The **☰** menu (top right) turns Base Questions and each expansion pack on
  and off, and holds **Suggest a Question**

- The **☆** (top left) marks tonight's best conversation — one per session
- **About Sip the Tea** sits at the bottom of the menu
- A short welcome appears once, before a device's first game

No accounts and nothing to sign up for. Still a static site, plus one small
write-only Supabase backend for ratings, suggestions and a thin event stream
— see [Ratings & suggestions](#ratings--suggestions) and
[Analytics & the admin dashboard](#analytics--the-admin-dashboard) below.

## The recommendation foundation

Sip the Tea is evolving from a deck into a recommendation engine for
in-person conversations. The foundation for that — permanent question and
revision ids, play telemetry, the recommendation interfaces, manual tags, and
the community question workflow — shipped on 2026-09-13 without changing how
the game plays. Start here:

| Doc | What it's for |
| --- | --- |
| [docs/strategy.md](docs/strategy.md) | Vision, doctrine, open questions, decision log — the living strategy |
| [docs/roadmap.md](docs/roadmap.md) | Shuffle → rules → learning → arcs, without rewrites |
| [docs/architecture/recommendation.md](docs/architecture/recommendation.md) | Policy, generator, ranker, arc, evaluation contracts |
| [docs/telemetry-spec.md](docs/telemetry-spec.md) | Exactly what is recorded and what every field means |
| [docs/schema.md](docs/schema.md) | Tables, views, functions, access model |
| [docs/implementation.md](docs/implementation.md) | Code map; tagging; community workflow; flags; checking telemetry |
| [docs/migration-notes.md](docs/migration-notes.md) | Deploy order, verification, rollback |
| [docs/adr/](docs/adr/README.md) | Architecture decision records |

Every database migration, including the ones applied before this, is in
[`supabase/migrations/`](supabase/migrations).

## Run it

```bash
npm install
npm run dev
```

Needs two environment variables to actually save ratings/suggestions —
without them the app runs fine, it just logs a console warning and silently
drops both. Create `.env.local` (already gitignored) with:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Both come from the **QB Production** Supabase project → Settings → API. The
same two names go into Vercel's Project Settings → Environment Variables for
the deployed site.

A third variable — `VITE_PRODUCTION_HOSTNAME` — gates every write (see
[Keeping test traffic out of the numbers](#keeping-test-traffic-out-of-the-numbers)).
Nothing is hardcoded: set it to the deployed site's real hostname (currently
`sipthetea.app`) in Vercel's **Production** environment, or writes
from the deployed site refuse themselves and say why in the console. Not
needed locally — `npm run dev` is caught by `import.meta.env.DEV` regardless.

## Build it

```bash
npm run build     # → dist/
npm run preview   # serve the built site
npm test          # deck, catalog, recommendation policy, telemetry
npm run test:db   # every migration on an in-process Postgres, exercised as anon/admin
```

## Deploy

Connected to Vercel for continuous deployment: every push to `main` builds
and deploys automatically. `vercel.json` already sets the framework, build
command, and output directory — no configuration needed.

## Edit the questions

Everything lives in [`src/questions.ts`](src/questions.ts), in two layers:

- `BASE_DECK` — Ian's original 114. **Do not edit or reorder**, and never
  delete: this array stays at 114 forever. Always free.

  Originals are no longer permanently protected. As of 2026-09-09 one may be
  **retired** when feedback says it isn't working — set `retired` with a
  reason and a date, and it stops being dealt. It keeps its id and its exact
  wording, so every rating ever filed against it stays attached and readable.
  Retiring is not deleting, and it is still not editing: reword an original
  and you have quietly changed what all its historical ratings were about.
  `baseQuestions` is the active subset — 113 today, since Dido is retired.
- `expansionQuestions` — Todd-created content, each tagged one of the twelve
  categories in `CATEGORIES`.

Every category is described by a **pack** in `PACKS`, which carries a `group`
and an optional `consent` string:

| Group | Packs | What it means |
| --- | --- | --- |
| `expansion` | Warm-up, Personal, Nostalgia, Adulting, Travel, Messy, Dating, Queer Culture, AI, Sex | Questions. Shown in the menu's **Expansion Packs** grid. |
| `challenge` | Dare, Dark Room | Dares, not questions. Shown in their own **Challenges** grid, after every expansion pack, so the two kinds never blur together. |

AI and Queer Culture shipped small on purpose — under 25 questions each — to
find out whether the subject was worth building out further. That trial is
over: both graduated into `expansion` alongside everything else, and nothing
in this file measures a pack's size against a band anymore.

### Ids

Every question carries an `id` — `base-001`, `exp-172` — assigned once and
never changed. **Ratings key on the id, not the text.** That is what lets a
question be reworded, or moved between packs, without orphaning the feedback
it has already collected; the text is a label, the id is the identity.

Ids are not positions. They were handed out in file order when they were
introduced, and a new question takes the next number wherever in the file it
ends up sitting. Renumbering them, or reusing one, silently detaches
history — so don't.

Three things follow from this, and all three are enforced by `npm test`:
rewording a question is safe and expected; moving one between packs is safe;
and `questionIdByIndex` must always line up with `questions`.

`questions` is the flat list the app plays (active base then active
expansion), in the same shape it has always had. `sourceByIndex` marks each entry `'original'` or
`'todd'` without changing either array's shape — that's the hook a future
paid-pack gate would read (`expansionQuestions` is already the exact set of
"Todd-created" content such a gate would sit in front of; nothing about that
is implemented here). Both `categoryByIndex` and `sourceByIndex` key on
*position* in `questions`, which is why ratings and suggestions (below) key
on question *text* instead — text survives array edits, a position doesn't.

## Categories

The **☰** button opens a menu: a pill at the top that opens **Suggest a
Question** (it doesn't accept text itself — tapping it is the whole
interaction), two full-width presets (**Base Questions**, **All Expansion
Packs**), then two two-column grids of tap-anywhere pills — **Expansion
Packs**, then **Challenges** — with no separate switch on any of them; the
whole pill is the toggle, and its fill color is the on/off state. A question
drawn from an enabled pack shows a small eyebrow above it (e.g. `SEX`); base
questions never get one. Swiping right anywhere on the open menu dismisses
it, the same direction that dismisses a card in the deck.

**All Expansion Packs** covers every `expansion`-group pack except Sex, and
nothing else. It reads as on only when every one of those already is; tap it
from any other state and it turns them all on, not off. Sex is outside it for
a specific reason — a bulk switch must never be able to put a consent-gated
pack into the shuffle without anyone agreeing to it first.

### Sex and Dark Room

Both consent-gated, both handled identically, and both listed openly in
their grid — neither is hidden behind a reveal step. Tapping one that hasn't
been agreed to yet this session opens a small screen instead of turning it
on directly: what the pack is, and that everyone playing has to say yes out
loud. **Everyone here agrees** turns it on; **Not tonight** returns to the
grid with it still off.

Switching one *off* never asks. Withdrawing is immediate — needing permission
to stop would be the wrong shape entirely. Consent is remembered for the rest
of the page load, so flipping it off and on again doesn't re-ask, and is
never remembered between visits: it's given by the people at this table,
tonight, and a previous visit can't grant it.

**Dark Room is dares only.** A dare is not a question; explicit *questions*
live in Sex. That split is recorded as data — a `kind: 'challenge'` on each
Dark Room entry, declared by a person rather than guessed from the wording by
a regex, which is not a thing a regex can do — and `npm test` holds it from
both directions: every Dark Room entry must carry `kind: 'challenge'`, and no
entry carrying it may sit outside Dark Room. A separate test keeps explicit
material out of Ian's canonical originals entirely.

**Dare is non-sexual dares only** — party stuff: push-ups, accents,
impressions, a moonwalk. Anything that touches sex, undressing, hookup apps,
or ranking each other's bodies is in Dark Room. The line was drawn generously
on purpose: a shoulder massage and "try your best opening line" aren't
sexual by most readings, but they involve touching or coming on to the
person next to you, which is exactly the kind of thing a table should have
opted into first. When a dare was arguable, it went behind the gate.

The seam is *dare vs. question*, not *how explicit the subject is*. So
`exp-302` ("Have you ever used Sniffies? How did that go?") sits in Sex and
stays there — it asks something, it doesn't instruct anyone to do anything.

Every pill is free to turn off, Base included — including all of them at
once. With nothing selected there's no question to draw, so the deck is
replaced by a small empty-state screen instead: the same gradient and
typography, a one-line joke picked at random from a short list, and a fixed
subheading — "Turn on at least one category" — under it. The **☰** button
still works from there, so getting back in is one tap away. Swiping does
nothing while it's up, and no keypress can force a draw with nothing to draw
from.

Changing categories mid-session never touches your history — going back
still replays exactly what you saw, in order — it only changes what's
eligible to be drawn *next*, including whether anything is eligible at all.
The choice isn't saved between visits; every fresh load starts on Base
Questions alone.

### Audit

The expansion was audited against the base deck. Two exact duplicates were
removed from the expansion; the base versions were kept. Near-duplicates were
**left in play** pending review — they are listed in the handover notes, not
marked in the data. `npm test` enforces the result: no expansion question may
duplicate a base question or another expansion question, and every expansion
question must carry a known category.

A second content pass added 93 new questions — topping up the original six
packs and introducing three new ones (Nostalgia, Adulting, Travel). Every new
question was checked against the full existing corpus for exact and
near-duplicate collisions before landing; see the session's final report for
the counts and the two calls flagged for editorial review rather than
implemented as originally suggested.

## How the deck works

The next card is chosen by a recommendation policy — today only
`UniformRandomPolicy` (`src/recommendation/uniformRandom.ts`), which is the
behaviour described below, now with an exact, logged probability for every
draw. See [docs/architecture/recommendation.md](docs/architecture/recommendation.md).

[`src/deck.ts`](src/deck.ts) holds a shuffled *bag* — not of every question,
but of every question in the current **pool**: whichever of Base Questions
and the expansion packs are switched on. Each left swipe draws from the bag,
so you see the whole pool before any repeats. When the bag empties it
reshuffles, and the question you're looking at is kept out of the next draw
so nothing repeats back to back.

Everything shown this session is kept in `history`, and a right swipe just walks
the cursor back through it. Going back and then forward replays the same
questions in order; swipe past the end and it draws something new. History is
never rewritten or lost while the page is open — not even by changing which
categories are enabled. `history`/`bag` always store absolute indices into the
full question list, never positions within the pool, so a category switching
on or off mid-session can't invalidate anything already shown. Toggling a
category reshuffles the bag immediately (over the new pool, excluding the
question on screen) rather than waiting for the old bag to run dry, so a
newly-enabled category is reachable on the very next swipe.

## Ratings & suggestions

[`src/feedback.ts`](src/feedback.ts) is the app's only outbound data, all of
it through a dedicated Supabase project (**QB Production**, kept separate
from any other project) via `@supabase/supabase-js`. Two tables, both
insert-only for the app — Row Level Security grants the public/anon key
`insert` and nothing else, so the client can never read a rating or
suggestion back, and nothing here or in the database can feed a submission
into the live deck automatically:

- `question_ratings` — one row per 👍/👎: `question_text`, `category`
  (null for Base), `source` (`'original'` | `'todd'`), `value` (`'up'` |
  `'down'`), `created_at`.
- `question_suggestions` — one row per submission: `suggested_text`,
  `suggested_category` (optional, nullable), `created_at`.

Both tables also carry `visitor_id`, `session_id` and `is_test` now, so a
rating can be tied back to the session that produced it and admin activity
can be kept out of the real numbers. Rows written before that existed have
nulls there and read as "pre-analytics". Review either table in Supabase's
Table Editor, or use the dashboard below.

Writes go out as a plain `fetch` POST at PostgREST rather than through the
Supabase SDK (`restInsert` in [`src/supabase.ts`](src/supabase.ts)). These
are insert-only rows against insert-only tables — the SDK's query builder,
auth and realtime buy nothing here and cost ~60KB gzipped in the main bundle.
The SDK is still used, lazily, by exactly one caller: the admin dashboard,
which genuinely needs sign-in.

The rate buttons sit where the dice used to, live only while there's a
question on screen (hidden on the empty-state screen, same as the dice was),
and share the dice's old `stopPropagation` treatment so a tap or a wobbly tap
never reads as a swipe. A question can be rated once per device: rating it
writes `{ [questionText]: 'up' | 'down' }` into `localStorage` immediately
(so the choice is reflected the instant you tap, and survives a reload),
which is also what disables both buttons for that question afterward. If the
network write to Supabase fails, the local "already rated" mark still holds
— rather than build a retry queue, a missed vote here and there is treated
as acceptable given ratings are an editorial signal, not a ledger.

**Suggest a Question** is the pill at the top of the existing ☰ menu —
tapping it swaps the menu panel's content to a small form (question text,
optional category picker) rather than opening a new overlay or route.
Submitting shows a plain-text "thanks" in the same panel; there's no
separate confirmation screen.

## Analytics & the admin dashboard

Three events, each fired at most once per session, all into one append-only
`analytics_events` table:

| Event | When |
| --- | --- |
| `app_opened` | page load, whether or not anyone taps past the landing screen |
| `session_started` | the tap into the deck |
| `session_completed` | five questions in (`SESSION_COMPLETE_AT`) |

The table is `{ name, props jsonb }`, and that shape is the point: a new
metric is a new event name or a new key in `props`, never a new column and
never a migration.

What's collected is deliberately thin — a random visitor id, a random session
id, an event name, and how many questions were seen. No accounts, no PII, no
fingerprinting, no third party. `visitor_id` is a UUID generated on the
device and kept in localStorage; it says "the same browser came back" and
nothing else, and clearing site data makes someone a new visitor.

**There is no natural end to a session** — the deck never runs out — so
"completed" is defined rather than observed. Five questions is the point
where someone has clearly played rather than glanced. The dashboard says so
next to the number.

### The dashboard

Lives at **/admin**, as its own lazy chunk — the dashboard, its stylesheet
and the Supabase SDK never reach someone who just came to play. It shows
traffic, engagement, deck counts (Base plus every question and challenge
category — from `questions.ts` directly, not a query), ratings by category
and by question, most liked, least liked, most polarizing, every rated
question, and the suggestion inbox.

Traffic and Engagement carry an **All time / Today** switch. "Today" reads
`analytics_events`, `question_ratings` and `question_suggestions` directly
(RLS already grants an admin `select` there — see below) rather than through
a new RPC, since the existing `admin_*` functions are all-time aggregates
with no date parameter. Everything else on the page — ratings by category and
question, the suggestion inbox — stays all-time regardless of the switch; a
single day rarely has enough ratings for "most liked today" to mean anything.

Most liked, least liked, and most polarizing each show their first 3 rows
with an **Expand** button revealing up to 8; "Every rated question" is
deliberately not capped — truncating a list whose whole point is completeness
would defeat it.

Security is entirely server-side; nothing in the bundle decides it. Sign-in
is Supabase Auth, every figure comes from a `SECURITY DEFINER` function that
calls `is_admin()` before it aggregates anything, and the tables grant
`select` only to signed-in users whose email is in `admin_emails`. Calling
the RPCs by hand with the anon key returns `permission denied for function`;
selecting from the tables returns `[]`. Both were checked directly against
the deployed project.

**Setting up access**, once per admin:

1. Supabase → Authentication → Users → **Add user**, with a real password.
   (`toddhansmann@gmail.com` is already in `admin_emails`; any other address
   needs a row there too.)
2. Go to /admin and sign in.

An account that exists but isn't on the allow-list sees zeroes, and the
dashboard says so rather than pretending there's no traffic.

### Keeping test traffic out of the numbers

`VITE_PRODUCTION_HOSTNAME` is checked at three separate points, deliberately
redundant, each catching what the one before it can't:

**1. The build itself refuses to happen.** [`vite.config.ts`](vite.config.ts)
throws during `vite build` if `VITE_PRODUCTION_HOSTNAME` isn't set — no
`dist/` gets produced, so a misconfigured Vercel deploy fails in the build
step and nothing reaches users at all. This is the earliest anything here can
happen, and the only layer that stops a bad configuration *before* a
deployment exists.

**2. The running app refuses to start.** [`src/production-config.ts`](src/production-config.ts)
is imported first, before anything else, in `main.tsx`, and throws if
`import.meta.env.PROD` is true and `VITE_PRODUCTION_HOSTNAME` is missing or
empty. This covers the gap layer 1 can't: a production bundle that reached a
browser without ever going through this repo's own `vite build` (a
hand-assembled deploy, a build step that bypassed the config). A visitor
sees a blank page and one console error rather than a site that looks fine
and quietly saves nothing.

**3. Every write checks it again, against the real hostname.** Every write —
ratings, suggestions, analytics events — goes through `restInsert` in
[`src/supabase.ts`](src/supabase.ts), and it refuses to send anything unless
the page's own hostname matches `VITE_PRODUCTION_HOSTNAME` *exactly* — not
just "is the variable set" (layers 1 and 2 already covered that), but "is
this specific page actually running on the configured host." If it isn't,
writes stop and one clear warning names which it was — once per page load,
not once per write. `import.meta.env.DEV` catches local dev on its own,
regardless of hostname or port, with no warning needed there (running
`vite dev` already means you know you're not in production). A
production-shaped build on any *other* host — a Vercel preview deployment,
most likely — hits the hostname mismatch instead. This is the only layer of
the three that runs continuously rather than once, so it's also the one that
catches a site later moved to a new hostname without redeploying.

None of the three needs a toggle or anything remembered — all three are just
always true, as long as the environment variable is set correctly wherever
the site is actually built and deployed.

**Test mode.** Signing in to the dashboard turns this on for that device, and
it can be toggled by hand from the header, or set from a URL without signing
in first — `?qbtest=1` on, `?qbtest=0` off, checked once on load and then
stripped from the address bar. Everything that device then sends is marked
`is_test = true` rather than dropped, and every dashboard metric excludes
test rows unless **Include test data** is ticked — so it's reversible: the
rows are still there to inspect if something needs debugging later.

**Device exclusion.** A separate, stronger toggle in the dashboard header —
**Exclude this device from analytics**. Where test mode tags a row, this
skips `analytics_events` entirely: `track()` returns before `restInsert` is
even called, so nothing about a page view or session is ever sent from that
device, tagged or otherwise (ratings and suggestions from an excluded device
still go out, tagged `is_test`, same as test mode — this is specifically
about page views and sessions, the numbers a forgotten test browser skews
most). Unlike test mode, it is never turned on automatically and has to be
switched on from its own checkbox — the trade it makes (nothing to recover
later) is deliberate enough that it shouldn't happen by accident. Persists in
that browser's `localStorage`, same mechanism as everything else here.

None of this is **unique visitor counting** fixed, and it can't be, within
this app's own constraints: `visitor_id` is a UUID in that browser's own
`localStorage` (see above), so a different browser on the same phone is,
correctly by that definition, a different visitor — there's no cross-browser
signal to dedupe against without an account, a cookie that browser doesn't
share, or fingerprinting, none of which are on the table here. IP-based
identity was considered and rejected for the same reason: a roomful of
players on one host's WiFi would undercount as a single visitor, which is
worse for this app's actual use than the overcount it would fix. What's above
is the practical fix for the actual complaint — an admin's own testing
inflating the real numbers — not a claim that two browsers on one phone will
ever resolve to one visitor.

All three are client-asserted, so a determined visitor could hide their own
activity. That costs them their own data and nobody else's.

## Notes

- Type scales in four steps by question length, capped against both viewport
  width and height, so nothing overflows from 320px up — including landscape.
- Type is Fraunces (weight 300, `SOFT` 100 / `WONK` 1) standing in for Cooper Lt
  BT, which has no web licence. Local Cooper names are deliberately kept out of
  the font stack: `Cooper Light` resolves to **Cooper Black** on machines that
  have it, which would set the whole deck in a heavy display face. To use a
  licensed Cooper, self-host the woff2 and put it first in the stack in
  `src/styles.css`.
- Background is a single vertical gradient, `#FD3D2F` to `#FE7014`, on both the
  start screen and the deck.
- Motion is limited to the card throw and respects `prefers-reduced-motion`.
