import { questions } from './questions'

/**
 * The set of question indices currently in play. `history`/`bag` always store
 * absolute indices into `questions`, never positions within a pool — that way
 * a pool can shrink or grow (categories toggling) without ever invalidating
 * an index already sitting in history.
 */
export type Pool = readonly number[]

export type Deck = {
  /** Every question shown this session, in the order it was shown. */
  history: number[]
  /** Where we are inside `history`. */
  cursor: number
  /** Remaining unseen questions for this pass, drawn from the end. */
  bag: number[]
}

/** Every index into `questions` — the pool when nothing is filtered. */
function fullPool(): number[] {
  return Array.from({ length: questions.length }, (_, i) => i)
}

/** A freshly shuffled pass over `pool`, never starting with `exclude`. */
export function makeBag(exclude: number | null, pool: Pool = fullPool()): number[] {
  const bag = [...pool]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  // We draw from the end, so guard the end against an immediate repeat.
  if (exclude !== null && bag.length > 1 && bag[bag.length - 1] === exclude) {
    ;[bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]]
  }
  return bag
}

export function initialDeck(pool: Pool = fullPool()): Deck {
  const bag = makeBag(null, pool)
  return { history: [bag.pop()!], cursor: 0, bag }
}

/**
 * Forward through history if we've gone back, otherwise draw a new question
 * from `pool`. Stale bag entries outside the current pool (a category just
 * got turned off) are dropped before drawing, never left to surface later.
 */
export function forward(d: Deck, pool: Pool = fullPool()): Deck {
  if (d.cursor < d.history.length - 1) return { ...d, cursor: d.cursor + 1 }
  const poolSet = new Set(pool)
  let bag = d.bag.filter((i) => poolSet.has(i))
  if (bag.length === 0) bag = makeBag(d.history[d.cursor], pool)
  const next = bag[bag.length - 1]
  return {
    history: [...d.history, next],
    cursor: d.cursor + 1,
    bag: bag.slice(0, -1),
  }
}

/** Back one step through history. Stops at the first question of the session. */
export function back(d: Deck): Deck {
  return d.cursor > 0 ? { ...d, cursor: d.cursor - 1 } : d
}
