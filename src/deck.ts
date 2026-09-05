import { questions } from './questions'

export type Deck = {
  /** Every question shown this session, in the order it was shown. */
  history: number[]
  /** Where we are inside `history`. */
  cursor: number
  /** Remaining unseen questions for this pass, drawn from the end. */
  bag: number[]
}

/** A freshly shuffled pass over the deck, never starting with `exclude`. */
export function makeBag(exclude: number | null, size = questions.length): number[] {
  const bag = Array.from({ length: size }, (_, i) => i)
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

export function initialDeck(size = questions.length): Deck {
  const bag = makeBag(null, size)
  return { history: [bag.pop()!], cursor: 0, bag }
}

/** Forward through history if we've gone back, otherwise draw a new question. */
export function forward(d: Deck, size = questions.length): Deck {
  if (d.cursor < d.history.length - 1) return { ...d, cursor: d.cursor + 1 }
  const bag = d.bag.length ? d.bag : makeBag(d.history[d.cursor], size)
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
