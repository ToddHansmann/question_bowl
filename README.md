# The Question Bowl

One question, the whole screen. Made for a table of people answering out loud.

Opens on a branded start screen; one tap on **Roll the First Question** drops you
into the deck.

- **Swipe left** — a new question you haven't seen
- **Swipe right** — back through everything you've already had
- **Arrow keys** work too, on a laptop
- 👍 / 👎 below the question rate it, once each
- The **☰** menu (top right) turns Base Questions and each expansion pack on
  and off, and holds **Suggest a Question**

No accounts and nothing to sign up for. Still a static site, plus one small
write-only Supabase backend for ratings, suggestions and a thin event stream
— see [Ratings & suggestions](#ratings--suggestions) and
[Analytics & the admin dashboard](#analytics--the-admin-dashboard) below.

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

## Build it

```bash
npm run build     # → dist/
npm run preview   # serve the built site
npm test          # deck logic: shuffling, history, no repeats
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

Every category is described by a **pack** in `PACKS`, which carries a `tier`
and an optional `consent` string:

| Tier | Packs | What it means |
| --- | --- | --- |
| `expansion` | Warm-up, Personal, Nostalgia, Adulting, Travel, Messy, Dating, Risqué, Challenge | The settled deck. Free, not being measured. |
| `experimental` | AI, Queer Culture, Dark Room | Deliberately small — 20–25 questions — shipped to find out whether the subject is worth more. |

The tier that isn't written yet is the point of the field. A pack that earns
its keep gets built out to ~100 questions and moves behind a price; that gate
reads `tier`, so adding it later is a new tier value and a check, not a
reshape of the file. **None of that is implemented**, and nothing in the app
assumes it. `npm test` holds the experimental packs to the 20–25 band so
"experiment" doesn't quietly become "pack we already committed to".

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

The **☰** button opens a menu with a switch for Base Questions, then three
groups: the nine settled packs under **Expansion Packs**, the experiments
under **Experimental**, and — only once asked for — the gated one. A question
drawn from an enabled pack shows a small eyebrow above it (e.g. `RISQUÉ`);
base questions never get one.

**All Expansion Packs** covers the nine settled packs and nothing else. It
reads as on only when every one of them already is; click it from any other
state and it turns them all on, not off. The experiments are deliberately
outside it: the whole point of shipping a small pack is to find out whether
people choose it, and a switch that turns everything on would destroy that
signal on the first tap. Gated packs are outside it for a harder reason — a
bulk switch must never be able to put explicit questions into the shuffle
without anyone agreeing to them.

### Dark Room

The explicit pack. It isn't listed at all until someone taps **Show the
explicit pack** at the foot of the menu — plain text, no switch, so it can't
be flipped on by a stray tap while scrolling. Switching it on then opens a
consent screen rather than enabling it: what the pack is, and that everyone
playing has to say yes out loud. **Everyone here agrees** turns it on;
**Not tonight** returns to the list with it still off.

Switching it *off* never asks. Withdrawing is immediate — needing permission
to stop would be the wrong shape entirely. Consent is remembered for the rest
of the page load, so flipping it off and on again doesn't re-ask, and is
never remembered between visits: it's given by the people at this table,
tonight, and a previous visit can't grant it.

**Dark Room is challenges only.** A challenge is a dare; explicit *questions*
live in Risqué. That split is recorded as data — a `kind: 'challenge'` on
each Dark Room entry, declared by a person rather than guessed from the
wording by a regex, which is not a thing a regex can do — and `npm test`
holds every Dark Room entry to it. A separate test keeps explicit material
out of Ian's canonical originals entirely.

The rule is applied all the way through: the two sexual dares that predated
it and were still sitting in the general Challenge pack (`exp-184`,
`exp-186`) have been moved behind the gate, keeping their ids. The Challenge
pack is non-sexual dares only.

The seam is *dare vs. question*, not *how explicit the subject is*. So
`exp-302` ("Have you ever used Sniffies? How did that go?") sits in Risqué
and stays there — it asks something, it doesn't instruct anyone to do
anything. Risqué is also an `expansion` pack, not an experimental one: the
20–25 band applies only to AI, Queer Culture and Dark Room, and Risqué has
no subgroups.

Every switch is free to turn off, Base included — including all of them at
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

One Risqué question was later removed outright by request ("Have you ever
used Sniffies? How did that go?"), with no replacement.

A second content pass added 93 new questions — topping up the original six
packs and introducing three new ones (Nostalgia, Adulting, Travel). Every new
question was checked against the full existing corpus for exact and
near-duplicate collisions before landing; see the session's final report for
the counts and the two calls flagged for editorial review rather than
implemented as originally suggested.

## How the deck works

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

**Suggest a Question** lives inside the existing ☰ menu — tapping it swaps
the menu panel's content to a small form (question text, optional category
picker) rather than opening a new overlay or route. Submitting shows a
plain-text "thanks" in the same panel; there's no separate confirmation
screen.

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
traffic, engagement, ratings by category and by question, most liked, most
polarizing, and the suggestion inbox.

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

### Test mode

Signing in to the dashboard turns **test mode** on for that device, and it
can be toggled by hand from the header. Everything that device then sends —
ratings, suggestions, events — is marked `is_test = true`, and every metric
excludes test rows unless **Include test data** is ticked. So demoing the app
on your own phone doesn't quietly become the beta's engagement numbers.

It's client-asserted, so a determined visitor could hide their own activity.
That costs them their own data and nobody else's.

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
