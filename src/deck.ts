import { questions } from './questions'
import { UNIFORM_RANDOM_POLICY } from './recommendation/uniformRandom'
import type { ContextSnapshot, RecommendationPolicy, Selection } from './recommendation/types'

/**
 * The set of question indices currently in play. `history`/`bag` always store
 * absolute indices into `questions`, never positions within a pool — that way
 * a pool can shrink or grow (categories toggling) without ever invalidating
 * an index already sitting in history.
 */
export type Pool = readonly number[]

/** How one card in `history` was chosen — exactly what telemetry logs for a draw. */
export type DrawRecord = Pick<Selection, 'policyId' | 'policyVersion' | 'probability' | 'candidateCount' | 'arcPhase'>

export type Deck = {
  /** Every question shown this session, in the order it was shown. */
  history: number[]
  /** Where we are inside `history`. */
  cursor: number
  /** Remaining unseen questions for this pass. Order carries no meaning. */
  bag: number[]
  /** Parallel to `history`: how each of those cards was selected. */
  draws: DrawRecord[]
}

/** Every index into `questions` — the pool when nothing is filtered. */
function fullPool(): number[] {
  return Array.from({ length: questions.length }, (_, i) => i)
}

/**
 * A fresh pass over `pool`. Kept (and still shuffled, which costs nothing)
 * for callers that reset a pass; the policy no longer depends on bag order.
 * Never ends with `exclude`, as it always guaranteed.
 */
export function makeBag(exclude: number | null, pool: Pool = fullPool()): number[] {
  const bag = [...pool]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  if (exclude !== null && bag.length > 1 && bag[bag.length - 1] === exclude) {
    ;[bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]]
  }
  return bag
}

function record(s: Selection): DrawRecord {
  return {
    policyId: s.policyId,
    policyVersion: s.policyVersion,
    probability: s.probability,
    candidateCount: s.candidateCount,
    arcPhase: s.arcPhase,
  }
}

export type DrawOptions = {
  policy?: RecommendationPolicy
  random?: () => number
  context?: ContextSnapshot | null
}

export function initialDeck(pool: Pool = fullPool(), options: DrawOptions = {}): Deck {
  const policy = options.policy ?? UNIFORM_RANDOM_POLICY
  const selection = policy.select({
    pool,
    state: { history: [], current: null, remaining: [], nextPosition: 1 },
    context: options.context ?? null,
    random: options.random ?? Math.random,
  })
  if (!selection) throw new Error('initialDeck: the starting pool is empty')
  return {
    history: [selection.candidate.index],
    cursor: 0,
    bag: [...selection.remaining],
    draws: [record(selection)],
  }
}

/**
 * Forward through history if we've gone back, otherwise ask the policy for a
 * new question from `pool`. Stale bag entries outside the current pool (a
 * category just got turned off) are never dealt.
 */
export function forward(d: Deck, pool: Pool = fullPool(), options: DrawOptions = {}): Deck {
  if (d.cursor < d.history.length - 1) return { ...d, cursor: d.cursor + 1 }
  const policy = options.policy ?? UNIFORM_RANDOM_POLICY
  const selection = policy.select({
    pool,
    state: {
      history: d.history,
      current: d.history[d.cursor] ?? null,
      remaining: d.bag,
      nextPosition: d.history.length + 1,
    },
    context: options.context ?? null,
    random: options.random ?? Math.random,
  })
  if (!selection) return d
  return {
    history: [...d.history, selection.candidate.index],
    cursor: d.cursor + 1,
    bag: [...selection.remaining],
    draws: [...d.draws, record(selection)],
  }
}

/** Back one step through history. Stops at the first question of the session. */
export function back(d: Deck): Deck {
  return d.cursor > 0 ? { ...d, cursor: d.cursor - 1 } : d
}
