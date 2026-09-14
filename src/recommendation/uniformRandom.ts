/**
 * `UniformRandomPolicy` — the shuffle Sip the Tea has always had, expressed
 * as a policy, and the permanent baseline every future policy is measured
 * against (docs/adr/0004-uniform-random-baseline.md).
 *
 * Behaviour, unchanged from the original bag shuffle as a player sees it:
 * - Every question in the pool is dealt once before any repeats.
 * - When the pass runs out, a new one begins over the current pool.
 * - The card on screen is never dealt again immediately.
 * - A pool change (a pack switched on or off) starts a fresh pass at once.
 *
 * The one thing that changed is *how* the next card is picked. The original
 * pre-shuffled a bag and popped from its end, with a swap to keep the current
 * card off the end of a new bag — which made the probability of any given
 * draw hard to state (that swap pushed the current card to the very bottom
 * of the new pass). This picks uniformly at random from what is left in the
 * pass at the moment of each draw. The sequence of cards is identically
 * distributed from the player's side, and the probability of every draw is
 * now exactly `1 / candidateCount` — which is the number telemetry must log.
 */
import { categoryByIndex, kindByIndex, questionIdByIndex, revisionIdByIndex, sourceByIndex } from '../questions'
import type {
  Candidate,
  CandidateGenerator,
  CandidateRequest,
  CandidateSet,
  RecommendationPolicy,
  Selection,
  SelectionRequest,
} from './types'

export function candidateFor(index: number): Candidate {
  return {
    index,
    questionId: questionIdByIndex[index],
    revisionId: revisionIdByIndex[index],
    category: categoryByIndex[index],
    source: sourceByIndex[index],
    kind: kindByIndex[index],
  }
}

/**
 * Candidates are whatever is left in the current pass through the pool,
 * minus the card on screen. When the pass is empty, a new one begins over
 * the whole pool. The only hard constraint today is the pool itself — packs
 * switched off and gated packs without consent never reach the pool (see
 * App.tsx), so they can never reach a candidate set.
 */
export class PassWithoutReplacementGenerator implements CandidateGenerator {
  readonly id = 'pass_without_replacement'

  generate({ pool, state }: CandidateRequest): CandidateSet {
    if (pool.length === 0) return { candidates: [], remainingAfterRefill: [], generatorId: this.id }
    const poolSet = new Set(pool)
    let remaining = state.remaining.filter((i) => poolSet.has(i))
    if (remaining.length === 0) remaining = [...pool]

    // Never the card already on screen — unless it is literally the only
    // thing in the pool, where repeating it beats dealing nothing.
    const eligible = remaining.filter((i) => i !== state.current)
    const chosenFrom = eligible.length > 0 ? eligible : remaining
    return {
      candidates: chosenFrom.map(candidateFor),
      remainingAfterRefill: remaining,
      generatorId: this.id,
    }
  }
}

export const UNIFORM_RANDOM_POLICY_ID = 'uniform_random'
export const UNIFORM_RANDOM_POLICY_VERSION = '1'

export class UniformRandomPolicy implements RecommendationPolicy {
  readonly id = UNIFORM_RANDOM_POLICY_ID
  readonly version = UNIFORM_RANDOM_POLICY_VERSION
  private readonly generator: CandidateGenerator

  constructor(generator: CandidateGenerator = new PassWithoutReplacementGenerator()) {
    this.generator = generator
  }

  select({ pool, state, context, random }: SelectionRequest): Selection | null {
    const set = this.generator.generate({ pool, state, context })
    const count = set.candidates.length
    if (count === 0) return null

    // `random()` is [0, 1); clamp guards a misbehaving source returning 1.
    const pick = Math.min(count - 1, Math.floor(random() * count))
    const candidate = set.candidates[pick]
    const base = set.remainingAfterRefill ?? pool
    return {
      candidate,
      probability: 1 / count,
      candidateCount: count,
      policyId: this.id,
      policyVersion: this.version,
      arcPhase: null,
      remaining: base.filter((i) => i !== candidate.index),
    }
  }
}

/** The one policy the game runs today. */
export const UNIFORM_RANDOM_POLICY: RecommendationPolicy = new UniformRandomPolicy()
