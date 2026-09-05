/**
 * Deck behaviour checks. No framework — run with `npm test`.
 */
import assert from 'node:assert/strict'
import { questions } from '../src/questions'
import { back, forward, initialDeck, makeBag, type Deck } from '../src/deck'

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
  for (let run = 0; run < 500; run++) {
    const bag = makeBag(7, 20)
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

console.log(results.map((r) => `  ok  ${r}`).join('\n'))
console.log(`\n${results.length} passed — ${questions.length} questions in the deck`)
