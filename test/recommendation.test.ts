/**
 * The recommendation framework: UniformRandomPolicy must behave exactly as
 * the shuffle always has, and must report exact selection probabilities.
 */
import assert from 'node:assert/strict'
import { basePool, categoryByIndex, questions, revisionIdByIndex } from '../src/questions'
import { forward, initialDeck, type Deck, type Pool } from '../src/deck'
import {
  PassWithoutReplacementGenerator,
  UNIFORM_RANDOM_POLICY,
  UniformRandomPolicy,
} from '../src/recommendation/uniformRandom'
import { buildContextSnapshot, sameContext } from '../src/recommendation/context'
import type { RecommendationPolicy, SessionState } from '../src/recommendation/types'
import { suite } from './harness'

const test = suite('recommendation')

/** Deterministic [0,1) stream for reproducible draws. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const empty: SessionState = { history: [], current: null, remaining: [], nextPosition: 1 }

test('the first draw is uniform over the pool, probability 1/n', () => {
  const pool: Pool = [3, 5, 8, 13]
  const s = UNIFORM_RANDOM_POLICY.select({ pool, state: empty, context: null, random: seeded(1) })!
  assert.ok(pool.includes(s.candidate.index))
  assert.equal(s.candidateCount, 4)
  assert.equal(s.probability, 0.25)
  assert.equal(s.policyId, 'uniform_random')
  assert.equal(s.policyVersion, '1')
  assert.equal(s.arcPhase, null)
  assert.deepEqual([...s.remaining].sort((a, b) => a - b), pool.filter((i) => i !== s.candidate.index))
})

test('the card on screen is never a candidate, so a refill draw is 1/(n-1)', () => {
  const pool: Pool = [0, 1, 2, 3, 4]
  const set = new PassWithoutReplacementGenerator().generate({
    pool,
    state: { history: [2], current: 2, remaining: [], nextPosition: 2 },
    context: null,
  })
  assert.deepEqual(set.candidates.map((c) => c.index).sort(), [0, 1, 3, 4])
  assert.deepEqual([...(set.remainingAfterRefill ?? [])].sort(), [0, 1, 2, 3, 4])
  const s = UNIFORM_RANDOM_POLICY.select({
    pool,
    state: { history: [2], current: 2, remaining: [], nextPosition: 2 },
    context: null,
    random: seeded(9),
  })!
  assert.equal(s.probability, 0.25)
  // The current card stays in the new pass and can come round again later.
  assert.ok(s.remaining.includes(2))
})

test('a one-question pool repeats rather than dealing nothing', () => {
  const s = UNIFORM_RANDOM_POLICY.select({
    pool: [7],
    state: { history: [7], current: 7, remaining: [], nextPosition: 2 },
    context: null,
    random: Math.random,
  })!
  assert.equal(s.candidate.index, 7)
  assert.equal(s.probability, 1)
})

test('an empty pool selects nothing', () => {
  assert.equal(UNIFORM_RANDOM_POLICY.select({ pool: [], state: empty, context: null, random: Math.random }), null)
})

test('stale entries outside the pool are never candidates', () => {
  const set = new PassWithoutReplacementGenerator().generate({
    pool: [1, 2],
    state: { history: [9], current: 9, remaining: [9, 10, 1], nextPosition: 2 },
    context: null,
  })
  assert.deepEqual(set.candidates.map((c) => c.index), [1])
})

test('draws are statistically uniform (chi-square over 40k draws)', () => {
  const pool: Pool = Array.from({ length: 20 }, (_, i) => i)
  const counts = new Array(20).fill(0)
  const random = seeded(12345)
  const N = 40_000
  for (let k = 0; k < N; k++) {
    counts[UNIFORM_RANDOM_POLICY.select({ pool, state: empty, context: null, random })!.candidate.index] += 1
  }
  const expected = N / 20
  const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0)
  // 19 degrees of freedom; p = 0.001 critical value is 43.8.
  assert.ok(chi < 43.8, `chi-square ${chi.toFixed(1)} suggests a biased draw`)
})

test('the policy is reproducible given the same random stream', () => {
  const run = () => {
    const random = seeded(42)
    let d: Deck = initialDeck(basePool, { random })
    for (let i = 0; i < 30; i++) d = forward(d, basePool, { random })
    return d.history
  }
  assert.deepEqual(run(), run())
})

test('the deck records how every card was drawn, parallel to history', () => {
  let d: Deck = initialDeck(basePool)
  for (let i = 0; i < 25; i++) d = forward(d, basePool)
  assert.equal(d.draws.length, d.history.length)
  // A full pass over n questions: probabilities run 1/n, 1/(n-1), ... 1/1.
  const n = basePool.length
  d.draws.forEach((draw, i) => {
    assert.equal(draw.policyId, 'uniform_random')
    assert.equal(draw.candidateCount, n - i)
    assert.equal(draw.probability, 1 / (n - i))
  })
})

test('walking back and forward through history records no new draws', () => {
  let d: Deck = initialDeck(basePool)
  for (let i = 0; i < 5; i++) d = forward(d, basePool)
  const draws = d.draws
  d = { ...d, cursor: 2 }
  d = forward(d, basePool)
  assert.equal(d.draws, draws)
})

test('a custom policy plugs into the deck without touching deck code', () => {
  const firstAlways: RecommendationPolicy = {
    id: 'first_candidate',
    version: 'test',
    select({ pool, state }) {
      const candidate = pool.find((i) => i !== state.current)
      if (candidate === undefined) return null
      const base = new UniformRandomPolicy().select({ pool, state, context: null, random: () => 0 })!
      return { ...base, candidate: { ...base.candidate, index: candidate }, probability: 1, policyId: this.id, policyVersion: this.version }
    },
  }
  let d: Deck = initialDeck([4, 5, 6], { policy: firstAlways })
  d = forward(d, [4, 5, 6], { policy: firstAlways })
  assert.deepEqual(d.history, [4, 5])
  assert.equal(d.draws[1].policyId, 'first_candidate')
})

test('candidates carry permanent identity, never just an index', () => {
  const s = UNIFORM_RANDOM_POLICY.select({ pool: basePool, state: empty, context: null, random: seeded(3) })!
  assert.equal(s.candidate.revisionId, revisionIdByIndex[s.candidate.index])
  assert.equal(s.candidate.category, categoryByIndex[s.candidate.index])
  assert.ok(questions[s.candidate.index])
})

test('context snapshots: unknown group dimensions are null, and equal rooms compare equal', () => {
  const base = {
    sessionId: 's',
    seq: 0,
    capturedAt: 't',
    reason: 'session_start' as const,
    baseEnabled: true,
    enabledCategories: ['Travel', 'AI'] as const,
    consentedCategories: [] as const,
    poolSize: 140,
  }
  const a = buildContextSnapshot({ ...base, snapshotId: 'a' })
  const b = buildContextSnapshot({ ...base, snapshotId: 'b', seq: 1, enabledCategories: ['AI', 'Travel'], reason: 'pool_changed' })
  assert.equal(a.group.size, null)
  assert.equal(a.group.relationship, null)
  assert.equal(a.ceilings.spice, null)
  assert.deepEqual(a.pool.enabledCategories, ['AI', 'Travel'])
  assert.ok(sameContext(a, b))
  assert.ok(!sameContext(a, buildContextSnapshot({ ...base, snapshotId: 'c', poolSize: 141 })))
})
