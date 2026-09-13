/**
 * Catalog: revisions, lifecycle, tags, community entries — and the places
 * where TypeScript and SQL must agree.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALL_BY_ID,
  BASE_DECK,
  CATALOG,
  CATALOG_VERSION,
  communityQuestions,
  expansionQuestions,
  questionIdByIndex,
  questions,
  revisionIdByIndex,
} from '../src/questions'
import { questionIdOfRevision, revisionIdFor, sha256Hex } from '../src/catalog/revision'
import { LIFECYCLE_STATUSES, LIFECYCLE_TRANSITIONS, canTransition, isDealt } from '../src/catalog/lifecycle'
import { TAG_DIMENSIONS, ordinalRank, tagCoverage, validateTags } from '../src/catalog/tags'
import { QUESTION_TAGS } from '../src/catalog/questionTags'
import { EXIT_ACTIONS } from '../src/telemetry/schema'
import { suite } from './harness'

const test = suite('catalog')

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')
function migration(nameIncludes: string): string {
  const file = readdirSync(MIGRATIONS).find((f) => f.includes(nameIncludes))
  assert.ok(file, `no migration matching ${nameIncludes}`)
  // Normalize line endings: a Windows checkout may convert these files to CRLF.
  return readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n')
}

test('sha256Hex matches node:crypto across ASCII, Unicode and block boundaries', () => {
  const inputs = [
    '',
    'abc',
    'a'.repeat(55),
    'a'.repeat(56),
    'a'.repeat(64),
    'a'.repeat(1000),
    'Text an ex, “I was just thinking about you.” No explanation, no follow-up.',
    'Café 🫖 — naïve',
    ...questions.slice(0, 50),
  ]
  for (const input of inputs) {
    assert.equal(sha256Hex(input), createHash('sha256').update(input, 'utf8').digest('hex'), JSON.stringify(input))
  }
})

test('a revision id is the question id plus 12 hex chars of the NFC text hash', () => {
  const id = revisionIdFor('exp-314', 'Do the elephant walk.')
  assert.match(id, /^exp-314@[0-9a-f]{12}$/)
  assert.equal(questionIdOfRevision(id), 'exp-314')
  // NFC: a precomposed and a decomposed é are the same wording.
  assert.equal(revisionIdFor('x-1', 'café'), revisionIdFor('x-1', 'café'))
})

test('any visible change to the wording is a new revision', () => {
  const a = revisionIdFor('base-001', 'What is your favourite food?')
  assert.notEqual(a, revisionIdFor('base-001', 'What is your favorite food?'))
  assert.notEqual(a, revisionIdFor('base-001', 'What is your favourite food? '))
  assert.notEqual(a, revisionIdFor('base-002', 'What is your favourite food?'))
})

test('revisionIdByIndex lines up with the dealt deck', () => {
  assert.equal(revisionIdByIndex.length, questions.length)
  questions.forEach((text, i) => assert.equal(revisionIdByIndex[i], revisionIdFor(questionIdByIndex[i], text)))
  assert.equal(new Set(revisionIdByIndex).size, revisionIdByIndex.length)
})

test('the SQL revision constraint uses the same formula as revisionIdFor', () => {
  const sql = migration('question_catalog_lifecycle_and_tags')
  assert.ok(
    sql.includes("left(encode(sha256(convert_to(normalize(text, NFC), 'UTF8')), 'hex'), 12)"),
    'the CHECK constraint formula changed — revision.ts must change with it',
  )
})

test('CATALOG covers every question ever written, archived included, exactly once', () => {
  const ids = CATALOG.map((c) => c.questionId)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(CATALOG.length, BASE_DECK.length + expansionQuestions.length + communityQuestions.length)
  for (const record of CATALOG) {
    assert.ok(ALL_BY_ID.has(record.questionId))
    assert.equal(record.revisionId, revisionIdFor(record.questionId, record.text))
    assert.equal(record.dealt, record.status === 'canon' || (record.status === 'experimental' && record.dealt))
    if (record.status === 'archived') assert.ok(record.archivedReason, `${record.questionId} archived without a reason`)
  }
})

test('every dealt question is in CATALOG as dealt, and nothing else is', () => {
  const dealt = new Set(CATALOG.filter((c) => c.dealt).map((c) => c.revisionId))
  assert.deepEqual([...dealt].sort(), [...revisionIdByIndex].sort())
})

test('CATALOG_VERSION is stable for the same deck and a 16-char hex string', () => {
  assert.match(CATALOG_VERSION, /^[0-9a-f]{16}$/)
  assert.equal(CATALOG_VERSION, sha256Hex([...revisionIdByIndex].sort().join('\n')).slice(0, 16))
})

test('lifecycle: promotion never skips a step and archived never jumps back to canon', () => {
  assert.ok(canTransition('draft', 'experimental'))
  assert.ok(canTransition('experimental', 'canon'))
  assert.ok(canTransition('canon', 'archived'))
  assert.ok(!canTransition('draft', 'canon'))
  assert.ok(!canTransition('archived', 'canon'))
  assert.ok(!canTransition('canon', 'experimental'))
  for (const s of LIFECYCLE_STATUSES) assert.ok(!canTransition(s, s))
})

test('lifecycle: only canon is always dealt; experimental only behind its flag', () => {
  assert.equal(isDealt('canon', false), true)
  assert.equal(isDealt('experimental', false), false)
  assert.equal(isDealt('experimental', true), true)
  assert.equal(isDealt('draft', true), false)
  assert.equal(isDealt('archived', true), false)
})

test('lifecycle transitions in TypeScript and SQL are identical', () => {
  const sql = migration('question_catalog_lifecycle_and_tags')
  const block = sql.slice(sql.indexOf('insert into public.lifecycle_transitions'))
  const rows = [...block.slice(0, block.indexOf(';')).matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`)
  const ts = Object.entries(LIFECYCLE_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
  assert.deepEqual(rows.sort(), ts.sort())
})

test('exit actions in TypeScript and SQL are identical', () => {
  const sql = migration('play_telemetry')
  const block = sql.slice(sql.indexOf('insert into public.exit_actions'))
  // Descriptions contain semicolons; the statement ends at the first `);` line end.
  const rows = [...block.slice(0, block.indexOf(');\n')).matchAll(/^\s*\('([a-z_]+)'/gm)].map((m) => m[1])
  assert.deepEqual(rows.sort(), [...EXIT_ACTIONS].sort())
})

test('community entries are well-formed: com- ids, shipped statuses, a submission', () => {
  for (const q of communityQuestions) {
    assert.match(q.id, /^com-\d{4,}$/)
    assert.notEqual(q.status as string, 'draft', `${q.id}: drafts never ship`)
    assert.match(q.submissionId, /^[0-9a-f-]{36}$/)
  }
})

test('tag scheme: unique dimension and value keys, snake_case', () => {
  const dims = TAG_DIMENSIONS.map((d) => d.key)
  assert.equal(new Set(dims).size, dims.length)
  for (const d of TAG_DIMENSIONS) {
    assert.match(d.key, /^[a-z][a-z_]*$/)
    const values = d.values.map((v) => v.key)
    assert.equal(new Set(values).size, values.length, `${d.key} repeats a value`)
    for (const v of values) assert.match(v, /^[a-z][a-z_]*$/)
  }
  assert.deepEqual(dims, ['depth', 'spice', 'energy', 'format', 'familiarity_required', 'group_size_fit', 'risk'])
})

test('tag validation accepts good records and names every problem in bad ones', () => {
  assert.deepEqual(validateTags({ depth: 'light', group_size_fit: ['pair', 'small'], risk: 'low' }), [])
  const problems = validateTags({ depth: 'bottomless', group_size_fit: [], colour: 'red', format: ['story'] })
  assert.equal(problems.length, 4)
  assert.equal(ordinalRank('depth', 'surface'), 0)
  assert.equal(ordinalRank('depth', 'deep'), 4)
  assert.equal(ordinalRank('format', 'story'), null)
  assert.equal(tagCoverage({ depth: 'light', risk: 'low' }), 2)
})

test('every manual tag entry names a real question and passes validation', () => {
  for (const [id, tags] of Object.entries(QUESTION_TAGS)) {
    assert.ok(ALL_BY_ID.has(id), `tags for unknown question ${id}`)
    assert.deepEqual(validateTags(tags as Record<string, unknown>), [], `${id}`)
  }
})
