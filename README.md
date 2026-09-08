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

No accounts, no analytics. Still a static site, plus one small write-only
Supabase backend for ratings and suggestions — see
[Ratings & suggestions](#ratings--suggestions) below.

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

- `baseQuestions` — Ian's original 114. **Canonical: do not edit or reorder.**
  Always free.
- `expansionQuestions` — Todd-created content, each tagged one of the nine
  categories in `CATEGORIES`: `Warm-up`, `Personal`, `Nostalgia`, `Adulting`,
  `Travel`, `Messy`, `Dating`, `Risqué`, or `Challenge`.

`questions` is the flat list the app plays (base then expansion), in the same
shape it has always had. `sourceByIndex` marks each entry `'original'` or
`'todd'` without changing either array's shape — that's the hook a future
paid-pack gate would read (`expansionQuestions` is already the exact set of
"Todd-created" content such a gate would sit in front of; nothing about that
is implemented here). Both `categoryByIndex` and `sourceByIndex` key on
*position* in `questions`, which is why ratings and suggestions (below) key
on question *text* instead — text survives array edits, a position doesn't.

## Categories

The **☰** button opens a menu with a switch for Base Questions, then the nine
expansion packs grouped under their own **Expansion Packs** heading — each
toggles independently, plus an **All Expansion Packs** switch that flips all
nine at once (it reads as on only when every pack already is; click it from
any other state and it turns them all on, not off). A question drawn from an
enabled pack shows a small eyebrow above it (e.g. `RISQUÉ`); base questions
never get one.

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

Review either table in Supabase's own Table Editor or SQL editor — there's no
admin UI in the app itself, by design.

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
