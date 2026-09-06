# The Question Bowl

One question, the whole screen. Made for a table of people answering out loud.

Opens on a branded start screen; one tap on **Roll the First Question** drops you
into the deck.

- **Swipe left** (or tap the dice) — a new question you haven't seen
- **Swipe right** — back through everything you've already had
- **Arrow keys** work too, on a laptop
- The **☰** menu (top right) turns Base Questions and each expansion pack on and off

No accounts, no backend, no analytics. It's a static site.

## Run it

```bash
npm install
npm run dev
```

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

- `baseQuestions` — the original 114. **Canonical: do not edit or reorder.**
- `expansionQuestions` — the expansion, each tagged `Warm-up`, `Personal`,
  `Messy`, `Dating`, `Risqué`, or `Challenge`.

`questions` is the flat list the app plays (base then expansion), in the same
shape it has always had.

## Categories

The **☰** button opens a menu with a switch for Base Questions, then the six
expansion packs grouped under their own **Expansion Packs** heading — each
toggles independently, plus an **All Expansion Packs** switch that flips all
six at once (it reads as on only when every pack already is; click it from
any other state and it turns them all on, not off). A question drawn from an
enabled pack shows a small eyebrow above it (e.g. `RISQUÉ`); base questions
never get one.

Any combination is fine, with one rule: something has to stay on. The one
toggle that would leave nothing selected — turning off the last enabled
source, whichever it is — is refused rather than dropping you into an empty
deck. Changing categories mid-session never touches your history — going back
still replays exactly what you saw, in order — it only changes what's
eligible to be drawn *next*. The choice isn't saved between visits; every
fresh load starts on Base Questions alone.

### Audit

The expansion was audited against the base deck. Two exact duplicates were
removed from the expansion; the base versions were kept. Near-duplicates were
**left in play** pending review — they are listed in the handover notes, not
marked in the data. `npm test` enforces the result: no expansion question may
duplicate a base question or another expansion question, and every expansion
question must carry a known category.

One Risqué question was later removed outright by request ("Have you ever
used Sniffies? How did that go?"), with no replacement.

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
