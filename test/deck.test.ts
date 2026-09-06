/**
 * Deck behaviour checks. No framework — run with `npm test`.
 */
import assert from 'node:assert/strict'
import {
  CATEGORIES,
  basePool,
  baseQuestions,
  categoryByIndex,
  expansionQuestions,
  questions,
} from '../src/questions'
import { back, forward, initialDeck, makeBag, type Deck, type Pool } from '../src/deck'

/** Ignore punctuation and case, so near-identical wording still collides. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const results: string[] = []
function test(name: string, fn: () => void) {
  fn()
  results.push(name)
}

test('the deck has questions and no duplicates', () => {
  assert.ok(questions.length > 50, 'expected a full deck')
  assert.equal(new Set(questions).size, questions.length, 'duplicate question text')
  assert.ok(
    questions.every((q) => q.trim().length > 0),
    'blank question',
  )
})

test('the base deck is intact at 114 questions', () => {
  assert.equal(baseQuestions.length, 114)
})

test('the deck is the base deck plus the expansion, in that order', () => {
  assert.equal(questions.length, baseQuestions.length + expansionQuestions.length)
  assert.deepEqual(questions.slice(0, 114), baseQuestions, 'base questions were altered')
})

test('no expansion question duplicates a base question', () => {
  const base = new Map(baseQuestions.map((q) => [normalize(q), q]))
  const collisions = expansionQuestions
    .map((e) => ({ expansion: e.text, base: base.get(normalize(e.text)) }))
    .filter((c) => c.base !== undefined)
  assert.deepEqual(collisions, [], 'exact duplicate survived the audit')
})

test('no expansion question duplicates another expansion question', () => {
  const seen = new Set<string>()
  const collisions: string[] = []
  for (const e of expansionQuestions) {
    const key = normalize(e.text)
    if (seen.has(key)) collisions.push(e.text)
    seen.add(key)
  }
  assert.deepEqual(collisions, [])
})

test('every expansion question has a known category', () => {
  const bad = expansionQuestions.filter((e) => !CATEGORIES.includes(e.category))
  assert.deepEqual(bad, [])
  for (const category of CATEGORIES) {
    assert.ok(
      expansionQuestions.some((e) => e.category === category),
      `no questions in category ${category}`,
    )
  }
})

test('drawing forward never repeats a question until the deck is exhausted', () => {
  let d: Deck = initialDeck()
  for (let i = 0; i < questions.length - 1; i++) d = forward(d)
  assert.equal(d.history.length, questions.length)
  assert.equal(new Set(d.history).size, questions.length, 'a question repeated within one pass')
})

test('the deck reshuffles and never repeats back to back across passes', () => {
  for (let run = 0; run < 200; run++) {
    let d: Deck = initialDeck()
    for (let i = 0; i < questions.length * 3; i++) {
      d = forward(d)
      assert.notEqual(
        d.history[d.cursor],
        d.history[d.cursor - 1],
        'same question twice in a row',
      )
    }
  }
})

test('stepping back walks history in reverse, stepping forward replays it', () => {
  let d: Deck = initialDeck()
  for (let i = 0; i < 9; i++) d = forward(d)
  const seen = [...d.history]

  for (let i = 0; i < 6; i++) d = back(d)
  assert.equal(d.cursor, 3)
  assert.equal(d.history[d.cursor], seen[3])

  for (let i = 0; i < 6; i++) d = forward(d)
  assert.equal(d.cursor, 9)
  assert.deepEqual(d.history, seen, 'history changed while re-walking it')
})

test('stepping back stops at the first question of the session', () => {
  let d: Deck = initialDeck()
  d = forward(d)
  d = back(d)
  const first = d
  d = back(d)
  assert.equal(d.cursor, 0)
  assert.equal(d, first, 'expected a no-op at the start of history')
})

test('history is never lost, even after going back and drawing new questions', () => {
  let d: Deck = initialDeck()
  for (let i = 0; i < 20; i++) d = forward(d)
  const before = [...d.history]

  for (let i = 0; i < 10; i++) d = back(d)
  for (let i = 0; i < 25; i++) d = forward(d)

  assert.deepEqual(d.history.slice(0, before.length), before, 'earlier history was rewritten')
  assert.equal(d.cursor, d.history.length - 1)
})

test('a fresh bag never opens with the question just shown', () => {
  const smallPool: Pool = Array.from({ length: 20 }, (_, i) => i)
  for (let run = 0; run < 500; run++) {
    const bag = makeBag(7, smallPool)
    assert.equal(bag.length, 20)
    assert.equal(new Set(bag).size, 20)
    assert.notEqual(bag[bag.length - 1], 7)
  }
})

test('every question is reachable', () => {
  const reached = new Set<number>()
  let d: Deck = initialDeck()
  for (let i = 0; i < questions.length * 2; i++) {
    reached.add(d.history[d.cursor])
    d = forward(d)
  }
  assert.equal(reached.size, questions.length)
})

/* --------------------------------------------------- category pooling --- */

test('the Sniffies question was removed and appears nowhere in the deck', () => {
  const hit = questions.find((q) => /sniffies/i.test(q))
  assert.equal(hit, undefined, `still present: ${hit}`)
})

test('basePool covers exactly the base questions, nothing else', () => {
  assert.equal(basePool.length, baseQuestions.length)
  for (const i of basePool) assert.equal(categoryByIndex[i], null)
})

test('categoryByIndex is null for base questions and set for every expansion question', () => {
  assert.equal(categoryByIndex.length, questions.length)
  for (let i = 0; i < baseQuestions.length; i++) assert.equal(categoryByIndex[i], null)
  for (let i = baseQuestions.length; i < questions.length; i++) {
    assert.ok(CATEGORIES.includes(categoryByIndex[i] as never), `bad category at index ${i}`)
  }
})

test('drawing forward with the base-only pool never surfaces an expansion question', () => {
  let d: Deck = initialDeck(basePool)
  for (let i = 0; i < 300; i++) {
    d = forward(d, basePool)
    assert.equal(categoryByIndex[d.history[d.cursor]], null, 'expansion question leaked into base-only mode')
  }
})

test('drawing forward with one category enabled only ever surfaces that category or base', () => {
  const category = 'Messy'
  const pool: Pool = questions
    .map((_, i) => i)
    .filter((i) => categoryByIndex[i] === null || categoryByIndex[i] === category)

  let d: Deck = initialDeck(pool)
  const seenCategories = new Set<string | null>()
  for (let i = 0; i < 200; i++) {
    d = forward(d, pool)
    const c = categoryByIndex[d.history[d.cursor]]
    assert.ok(c === null || c === category, `unexpected category leaked in: ${c}`)
    seenCategories.add(c)
  }
  assert.ok(seenCategories.has(category), 'the enabled category never appeared')
  assert.ok(seenCategories.has(null), 'base questions never appeared alongside it')
})

test('enabling every category makes every question reachable', () => {
  const pool: Pool = questions.map((_, i) => i)
  const reached = new Set<number>()
  let d: Deck = initialDeck(pool)
  for (let i = 0; i < questions.length * 2; i++) {
    reached.add(d.history[d.cursor])
    d = forward(d, pool)
  }
  assert.equal(reached.size, questions.length)
})

test('narrowing the pool mid-session drops stale bag entries without corrupting history', () => {
  const wide: Pool = questions.map((_, i) => i)
  let d: Deck = initialDeck(wide)
  for (let i = 0; i < 30; i++) d = forward(d, wide)
  const historyBefore = [...d.history]

  // Narrow to base only — as if every expansion category was just switched off.
  for (let i = 0; i < 60; i++) {
    d = forward(d, basePool)
    assert.equal(categoryByIndex[d.history[d.cursor]], null, 'narrowed pool still drew an expansion question')
    assert.ok(
      d.history[d.cursor] !== undefined && questions[d.history[d.cursor]] !== undefined,
      'narrowing the pool produced an undefined question',
    )
  }
  assert.deepEqual(d.history.slice(0, historyBefore.length), historyBefore, 'history was rewritten by a pool change')
})

test('walking backward through history still works after the pool changes', () => {
  const wide: Pool = questions.map((_, i) => i)
  let d: Deck = initialDeck(wide)
  for (let i = 0; i < 10; i++) d = forward(d, wide)
  const seen = [...d.history]

  // Categories change (pool narrows), then the user swipes back through
  // questions they already saw under the old, wider pool.
  for (let i = 0; i < 10; i++) d = back(d)
  assert.equal(d.cursor, 0)
  assert.deepEqual(d.history, seen, 'history changed just from walking backward')
  assert.equal(questions[d.history[d.cursor]], questions[seen[0]])
})

console.log(results.map((r) => `  ok  ${r}`).join('\n'))
console.log(`\n${results.length} passed — ${questions.length} questions in the deck`)
