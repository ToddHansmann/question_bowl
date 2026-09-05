# The Question Bowl

One question, the whole screen. Made for a table of people answering out loud.

Opens on a branded start screen; one tap on **Roll the First Question** drops you
into the deck.

- **Swipe right** (or tap the dice) — a new question you haven't seen
- **Swipe left** — back through everything you've already had
- **Arrow keys** work too, on a laptop

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

Push to a Git repo and import it on Vercel. `vercel.json` already sets the
framework, build command, and output directory — no configuration needed.

## Edit the questions

Everything lives in [`src/questions.ts`](src/questions.ts): one string per
question, order irrelevant. Add, remove, or reword freely; the app shuffles
whatever is in the list.

## How the deck works

[`src/deck.ts`](src/deck.ts) holds a shuffled *bag* of every question. Each
right swipe draws from the bag, so you see all 114 before any repeats. When
the bag empties it reshuffles, and the question you're looking at is kept out
of the next draw so nothing repeats back to back.

Everything shown this session is kept in `history`, and a left swipe just walks
the cursor back through it. Going back and then forward replays the same
questions in order; swipe past the end and it draws something new. History is
never rewritten or lost while the page is open.

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
