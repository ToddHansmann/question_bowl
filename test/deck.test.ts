/**
 * Deck behaviour checks. No framework — run with `npm test`.
 */
import assert from 'node:assert/strict'
import {
  ALL_BY_ID,
  BASE_DECK,
  CATEGORIES,
  GATED_PACKS,
  OPEN_PACKS,
  PACKS,
  basePool,
  baseQuestions,
  categoryByIndex,
  expansionQuestions,
  packFor,
  questionIdByIndex,
  questions,
  sourceByIndex,
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

test('the base deck is intact, minus whatever has been retired', () => {
  assert.equal(BASE_DECK.length, 114, 'an original was deleted rather than retired')
  const retired = BASE_DECK.filter((q) => q.retired).length
  assert.equal(baseQuestions.length, 114 - retired)
})

test('the deck is the base deck plus the expansion, in that order', () => {
  const activeExpansion = expansionQuestions.filter((q) => !q.retired)
  assert.equal(questions.length, baseQuestions.length + activeExpansion.length)
  assert.deepEqual(
    questions.slice(0, baseQuestions.length),
    baseQuestions,
    'base questions were altered',
  )
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

/*
 * This rule has now moved twice, so it is worth writing down where it landed.
 *
 * First the Sniffies question was banned outright and a test held it out of
 * the deck. Then it came back and the test narrowed to "explicit material
 * only behind the consent gate". Todd's 2026-09-09 decision splits it along a
 * different seam entirely: Dark Room is *challenges* only, and explicit
 * questions belong in Sex (renamed from Risqué) — which is where that
 * question originally lived and has now returned to.
 *
 * So the gated-pack half of the old test is gone: it would now fail on a
 * placement that is deliberate. What survives is the half that is still true
 * and still worth guarding — none of this belongs in Ian's canonical
 * originals. The challenges-only rule is enforced on its own below, on the
 * declared `kind` rather than on a guess about wording.
 */
test('no explicit material reaches the canonical base deck', () => {
  const explicit = /sniffies|grindr|orgasm|hookup app/i
  for (const q of BASE_DECK) {
    assert.ok(!explicit.test(q.text), `explicit question in the base deck: ${q.text}`)
  }
})

test('Sex and Dark Room are gated, and no other pack is', () => {
  assert.deepEqual(
    GATED_PACKS.map((p) => p.category),
    ['Sex', 'Dark Room'],
  )
  for (const category of ['Sex', 'Dark Room'] as const) {
    const pack = packFor(category)
    assert.ok(pack.consent && pack.consent.length > 40, `${category} needs real consent copy`)
    assert.ok(
      !OPEN_PACKS.some((p) => p.category === category),
      'a gated pack must not be listed openly',
    )
  }
})

test('PACKS describes every category exactly once, in menu order', () => {
  assert.deepEqual(
    PACKS.map((p) => p.category),
    CATEGORIES,
  )
  assert.equal(new Set(PACKS.map((p) => p.category)).size, PACKS.length)
  const used = new Set(expansionQuestions.map((q) => q.category))
  for (const c of used) assert.ok(CATEGORIES.includes(c), `question in unknown pack: ${c}`)
  for (const p of PACKS) {
    assert.ok(used.has(p.category), `pack with no questions: ${p.category}`)
  }
  assert.deepEqual(
    [...OPEN_PACKS, ...GATED_PACKS].map((p) => p.category).sort(),
    CATEGORIES.slice().sort(),
    'every pack is either open or gated',
  )
})

/*
 * The 114 are still all here — retiring one takes it out of play, it does not
 * delete it. BASE_DECK is the archive and stays at 114 forever; baseQuestions
 * is what gets dealt, and is 113 now that Dido is retired. Ian's originals
 * stopped being permanently protected on 2026-09-09: they can be retired when
 * feedback says they aren't working, which is what happened here.
 */
test('the canonical base deck still holds all 114 originals', () => {
  assert.equal(BASE_DECK.length, 114, 'an original was deleted rather than retired')
})

test('exactly one original is retired, and it is Dido', () => {
  const retired = BASE_DECK.filter((q) => q.retired)
  assert.deepEqual(retired.map((q) => q.id), ['base-006'])
  assert.ok(retired[0].retired!.length > 20, 'a retirement needs a stated reason')
  assert.equal(baseQuestions.length, 113, 'active originals should be 114 minus Dido')
})

test('the Dido question is no longer dealt, but is not deleted', () => {
  assert.ok(
    !questions.some((q) => /Dido/i.test(q)),
    'Dido is still in the active deck',
  )
  const dido = ALL_BY_ID.get('base-006')
  assert.ok(dido, 'base-006 must still resolve — ratings are filed under it')
  assert.ok(/Dido/i.test(dido!.text), 'the retired wording should be kept verbatim')
})

/* --------------------------------------------------- stable question ids --- */

test('every question has an id, and no id is used twice', () => {
  const all = [...BASE_DECK, ...expansionQuestions]
  for (const q of all) {
    assert.ok(/^(base|exp)-\d{3}$/.test(q.id), `malformed id: ${q.id}`)
  }
  assert.equal(new Set(all.map((q) => q.id)).size, all.length, 'duplicate id')
  assert.equal(ALL_BY_ID.size, all.length)
})

test('questionIdByIndex lines up with the active deck', () => {
  assert.equal(questionIdByIndex.length, questions.length)
  for (let i = 0; i < questions.length; i++) {
    const entry = ALL_BY_ID.get(questionIdByIndex[i])
    assert.ok(entry, `no entry for ${questionIdByIndex[i]}`)
    assert.equal(entry!.text, questions[i], `id/text mismatch at index ${i}`)
    assert.ok(!entry!.retired, 'a retired question was dealt')
  }
})

/*
 * The point of the ids, pinned. These four questions have been reworded or
 * moved between packs since they were written, and every rating already filed
 * against them lives under the id — so if one of these numbers ever changes,
 * that history silently detaches. Changing the wording is fine and expected;
 * changing the id is the bug.
 */
test('reworded and moved questions kept their original ids', () => {
  const byId = (id: string) => ALL_BY_ID.get(id)

  const doubleDip = byId('exp-027')
  assert.ok(doubleDip && /double-dips in the shared bowl/.test(doubleDip.text))
  assert.ok(!/George/.test(doubleDip!.text), 'the Seinfeld reference should be gone')

  const onABreak = byId('exp-126')
  assert.ok(onABreak && /understood it differently/.test(onABreak.text))
  assert.ok(!/Ross|Rachel/.test(onABreak!.text), 'the Friends reference should be gone')

  // Moved packs, same id. exp-302 sitting in Sex (renamed from Risqué) is a
  // decision, not an oversight: it is a question about a hookup app, not a
  // dare, and the Dark Room rule sorts on that distinction rather than on how
  // explicit the subject is. Todd confirmed it stays. Don't "tidy" it back
  // behind the gate.
  assert.equal((byId('exp-169') as { category?: string }).category, 'Dark Room')
  assert.equal((byId('exp-302') as { category?: string }).category, 'Sex')
  assert.equal((byId('exp-184') as { category?: string }).category, 'Dark Room')
  assert.equal((byId('exp-186') as { category?: string }).category, 'Dark Room')
})

/* ----------------------------------------------------------- Dark Room / Sex --- */

test('Dark Room contains challenges only', () => {
  // Retired entries included on purpose: a retired dare is still a dare, and
  // if one were ever un-retired it must not slip back in mislabelled.
  const dark = expansionQuestions.filter((q) => q.category === 'Dark Room')
  assert.ok(dark.length > 0, 'Dark Room should not be empty')
  for (const q of dark) {
    assert.equal(q.kind, 'challenge', `Dark Room entry is not a challenge: ${q.text}`)
  }
})

/*
 * The other half of the same rule, and the one that actually caught something:
 * checking only from Dark Room's side let six sexual dares sit in the open
 * Dare pack (Challenge at the time) for three sessions, where anyone
 * flipping that switch met them with no consent screen at all. Assert it
 * from both directions.
 */
test('no challenge sits outside the consent gate', () => {
  const stray = expansionQuestions.filter(
    (q) => q.kind === 'challenge' && q.category !== 'Dark Room',
  )
  assert.deepEqual(stray.map((q) => q.id), [], 'challenge outside Dark Room')
})

test('exp-195 is retired, not deleted', () => {
  const q = expansionQuestions.find((e) => e.id === 'exp-195')
  assert.ok(q, 'exp-195 must still exist — ratings are filed under it')
  assert.ok(q!.retired && q!.retired.length > 20, 'a retirement needs a stated reason')
  assert.ok(
    !questions.includes(q!.text),
    'a retired question must never be dealt',
  )
})

test('the questions moved out of Dark Room are in Sex', () => {
  const sex = expansionQuestions.filter((q) => q.category === 'Sex').map((q) => q.id)
  for (const id of ['exp-302', 'exp-305', 'exp-306', 'exp-307', 'exp-308', 'exp-309']) {
    assert.ok(sex.includes(id), `${id} should be in Sex`)
  }
  // The active roster — what a table can actually be dealt.
  const dark = expansionQuestions
    .filter((q) => q.category === 'Dark Room' && !q.retired)
    .map((q) => q.id)
  assert.deepEqual(dark.sort(), [
    'exp-169', 'exp-183', 'exp-184', 'exp-185', 'exp-186', 'exp-187',
    'exp-188', 'exp-189', 'exp-190', 'exp-191', 'exp-192', 'exp-193',
    'exp-194', 'exp-196', 'exp-197', 'exp-301', 'exp-304', 'exp-310',
    'exp-311', 'exp-312', 'exp-313', 'exp-314',
  ])
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

test('sourceByIndex marks exactly the base questions original and everything else todd', () => {
  assert.equal(sourceByIndex.length, questions.length)
  for (let i = 0; i < baseQuestions.length; i++) assert.equal(sourceByIndex[i], 'original')
  for (let i = baseQuestions.length; i < questions.length; i++) assert.equal(sourceByIndex[i], 'todd')
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
