/**
 * Database suite: replays every migration in supabase/migrations against an
 * in-process Postgres (PGlite) and exercises the schema the way the app and
 * the dashboard will — as `anon`, as a signed-in non-admin, and as an admin.
 *
 * Nothing here touches a real Supabase project. Supabase-specific pieces are
 * stubbed to match production: the `anon` and `authenticated` roles, default
 * table/function grants to both, and `auth.jwt()` reading request claims.
 *
 * Run with `npm run test:db`.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { CATALOG } from '../src/questions'
import { TAG_DIMENSIONS, TAG_SCHEME_VERSION } from '../src/catalog/tags'
import { revisionIdFor } from '../src/catalog/revision'
import { SessionTracker, type TelemetrySink } from '../src/telemetry/tracker'
import type { TelemetryTable } from '../src/telemetry/schema'
import { run, suite } from './harness'

const test = suite('database (PGlite)')
const ADMIN = 'editor@example.com'

const db = new PGlite()

async function asSuper<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`)
  return fn()
}

async function as<T>(role: 'anon' | 'authenticated', email: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role;`)
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [email ? JSON.stringify({ email }) : ''])
  await db.exec(`set role ${role};`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role;`)
  }
}

/** Inserts a row the way PostgREST does: only the columns the client sent. */
async function insertRow(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row)
  const list = cols.map((c) => `"${c}"`).join(', ')
  return db.query(`insert into public.${table} (${list}) select ${list} from json_populate_record(null::public.${table}, $1::json)`, [
    JSON.stringify(row),
  ])
}

async function rejects(fn: () => Promise<unknown>, pattern: RegExp, message: string) {
  try {
    await fn()
  } catch (err) {
    assert.match(String((err as Error).message), pattern, message)
    return
  }
  assert.fail(`${message}: expected an error`)
}

function catalogPayload(overrides: (c: (typeof CATALOG)[number]) => Partial<(typeof CATALOG)[number]> & { tags?: unknown } = () => ({})) {
  return CATALOG.map((c) => {
    const o = overrides(c)
    const text = o.text ?? c.text
    return { ...c, ...o, text, revisionId: revisionIdFor(c.questionId, text) }
  })
}

const SCHEME = { version: TAG_SCHEME_VERSION, dimensions: TAG_DIMENSIONS }

async function sync(payload: unknown) {
  const r = await as('authenticated', ADMIN, () =>
    db.query<{
      questions_added: number
      revisions_added: number
      statuses_recorded: number
      tags_recorded: number
      community_drift: string[]
      skipped: string[]
    }>(`select * from public.admin_sync_catalog($1::jsonb, $2::jsonb)`, [JSON.stringify(payload), JSON.stringify(SCHEME)]),
  )
  return r.rows[0]
}

/* -------------------------------------------------------------- setup --- */

test('every migration applies cleanly, in order, on a Supabase-shaped database', async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    grant execute on function auth.jwt() to anon, authenticated;
  `)
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  assert.ok(files.length >= 11, 'expected the recorded history plus the new migrations')
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'))
    } catch (err) {
      throw new Error(`${file}: ${(err as Error).message}`)
    }
  }
  await db.query(`insert into public.admin_emails (email) values ($1)`, [ADMIN])
})

/* ------------------------------------------------------------ catalog --- */

test('catalog sync registers every question, revision and status; SQL hashes agree with TypeScript', async () => {
  const r = await sync(catalogPayload())
  assert.deepEqual(r.skipped, [])
  assert.equal(r.questions_added, CATALOG.length)
  assert.equal(r.revisions_added, CATALOG.length)
  assert.equal(r.statuses_recorded, CATALOG.length)
  const archived = await asSuper(() =>
    db.query<{ n: number }>(`select count(*)::int n from public.question_current_status where status = 'archived'`),
  )
  assert.equal(archived.rows[0].n, CATALOG.filter((c) => c.status === 'archived').length)
})

test('catalog sync is idempotent', async () => {
  const r = await sync(catalogPayload())
  assert.equal(r.questions_added + r.revisions_added + r.statuses_recorded + r.tags_recorded, 0)
  assert.deepEqual(r.skipped, [])
})

test('a reworded question becomes a new revision; the old one is kept', async () => {
  const target = CATALOG.find((c) => c.status === 'canon')!
  const r = await sync(catalogPayload((c) => (c.questionId === target.questionId ? { text: c.text + ' Be honest.' } : {})))
  assert.equal(r.revisions_added, 1)
  assert.equal(r.statuses_recorded, 0)
  const revs = await asSuper(() =>
    db.query(`select revision_id from public.question_revisions where question_id = $1`, [target.questionId]),
  )
  assert.equal(revs.rows.length, 2)
})

test('a revision whose id does not match its text is refused', async () => {
  await asSuper(() =>
    rejects(
      () => db.query(`insert into public.question_revisions (revision_id, question_id, text, recorded_by) values ('base-001@000000000000', 'base-001', 'Anything', 'test')`),
      /revision_id_matches_text/,
      'mismatched revision id',
    ),
  )
})

test('retiring in code is recorded as a transition; un-retiring straight to canon is refused', async () => {
  const target = CATALOG.find((c) => c.status === 'canon' && c.origin === 'todd')!
  const retire = await sync(catalogPayload((c) => (c.questionId === target.questionId ? { status: 'archived', archivedReason: 'Test retirement' } : {})))
  assert.equal(retire.statuses_recorded, 1)
  const back = await sync(catalogPayload())
  assert.equal(back.statuses_recorded, 0)
  assert.equal(back.skipped.length, 1)
  assert.match(back.skipped[0], /cannot move archived → canon/)
})

test('tags sync per revision, are validated, and only record changes', async () => {
  const target = CATALOG.find((c) => c.questionId === 'base-001')!
  const tags = { depth: 'light', group_size_fit: ['pair', 'small'], risk: 'low' }
  const first = await sync(catalogPayload((c) => (c.questionId === target.questionId ? { tags } : {})))
  assert.equal(first.tags_recorded, 3)
  const again = await sync(catalogPayload((c) => (c.questionId === target.questionId ? { tags } : {})))
  assert.equal(again.tags_recorded, 0)
  const bad = await sync(catalogPayload((c) => (c.questionId === target.questionId ? { tags: { depth: 'bottomless' } } : {})))
  assert.equal(bad.tags_recorded, 0)
  assert.match(bad.skipped.join(' '), /bottomless is not a value of depth/)
})

/* ------------------------------------------------------------ editorial --- */

let submissionId = ''

test('community submissions: anon can submit but never read back', async () => {
  await as('anon', null, () => insertRow('question_suggestions', { suggested_text: 'What’s a hill you would die on?', suggested_category: 'Personal' }))
  const seen = await as('anon', null, () => db.query(`select * from public.question_suggestions`))
  assert.equal(seen.rows.length, 0)
  const row = await asSuper(() => db.query<{ id: string }>(`select id from public.question_suggestions limit 1`))
  submissionId = row.rows[0].id
})

test('editorial functions refuse anyone who is not an admin', async () => {
  await as('authenticated', 'someone@example.com', () =>
    rejects(() => db.query(`select public.admin_review_submission($1, 'accepted')`, [submissionId]), /not an admin/, 'non-admin review'),
  )
  await as('anon', null, () =>
    rejects(() => db.query(`select public.admin_review_submission($1, 'accepted')`, [submissionId]), /permission denied/, 'anon review'),
  )
})

test('accepting a submission creates a permanent com- id in draft', async () => {
  const r = await as('authenticated', ADMIN, () =>
    db.query<{ id: string }>(`select public.admin_review_submission($1, 'accepted', 'Good one', 'What’s a hill you’d die on?') as id`, [submissionId]),
  )
  assert.equal(r.rows[0].id, 'com-0001')
  const status = await asSuper(() => db.query<{ status: string; actor: string }>(`select status, actor from public.question_current_status where question_id = 'com-0001'`))
  assert.deepEqual(status.rows[0], { status: 'draft', actor: ADMIN })
  await as('authenticated', ADMIN, () =>
    rejects(() => db.query(`select public.admin_review_submission($1, 'accepted')`, [submissionId]), /already accepted/, 'double accept'),
  )
})

test('the lifecycle is enforced: no skipping to canon, no going backwards', async () => {
  const move = (to: string) =>
    as('authenticated', ADMIN, () => db.query(`select public.admin_transition_question('com-0001', $1, 'test')`, [to]))
  await rejects(() => move('canon'), /cannot move from draft to canon/, 'draft → canon')
  await as('authenticated', ADMIN, () =>
    db.query(`select public.admin_revise_draft('com-0001', 'What hill would you die on?', 'tighter')`),
  )
  await move('experimental')
  await as('authenticated', ADMIN, () =>
    rejects(() => db.query(`select public.admin_revise_draft('com-0001', 'x', 'y')`), /only drafts are revised/, 'revise experimental'),
  )
  await move('canon')
  await rejects(() => move('experimental'), /cannot move from canon to experimental/, 'canon → experimental')
  const events = await asSuper(() => db.query(`select to_status from public.question_lifecycle_events where question_id = 'com-0001' order by event_id`))
  assert.deepEqual(events.rows.map((e: any) => e.to_status), ['draft', 'experimental', 'canon'])
  const revisions = await asSuper(() => db.query(`select 1 from public.question_revisions where question_id = 'com-0001'`))
  assert.equal(revisions.rows.length, 2)
})

test('sync reports drift for community questions instead of overwriting the editorial record', async () => {
  const payload = [
    ...catalogPayload(),
    { questionId: 'com-0001', text: 'What hill would you die on?', revisionId: revisionIdFor('com-0001', 'What hill would you die on?'), origin: 'community', category: 'Personal', kind: 'question', status: 'experimental', dealt: false, archivedReason: null },
  ]
  const r = await sync(payload)
  assert.equal(r.community_drift.length, 1)
  assert.match(r.community_drift[0], /com-0001: build says experimental, database says canon/)
})

test('lifecycle history cannot be edited or deleted, even by the owner', async () => {
  await asSuper(() => rejects(() => db.query(`update public.question_lifecycle_events set reason = 'rewritten'`), /append-only/, 'update'))
  await asSuper(() => rejects(() => db.query(`delete from public.question_revisions`), /append-only/, 'delete'))
})

test('ratings accept community questions and still refuse unknown sources', async () => {
  await as('anon', null, () => insertRow('question_ratings', { question_text: 'x', source: 'community', value: 'up' }))
  await as('anon', null, () => rejects(() => insertRow('question_ratings', { question_text: 'x', source: 'bogus', value: 'up' }), /question_ratings_source_check/, 'bogus source'))
})

/* ------------------------------------------------------------ telemetry --- */

const produced: { table: TelemetryTable; row: Record<string, unknown> }[] = []

test('rows produced by the real tracker insert as anon, exactly as shaped', async () => {
  let n = 0
  let t = 0
  const sink: TelemetrySink = { send: (table, row) => void produced.push({ table, row: row as Record<string, unknown> }) }
  const tracker = new SessionTracker({
    monotonicNow: () => t,
    wallNow: () => new Date(Date.UTC(2026, 8, 13) + t).toISOString(),
    uuid: () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    sink,
    deviceId: '20000000-0000-4000-8000-000000000001',
    sessionId: '30000000-0000-4000-8000-000000000001',
    isTest: () => false,
    enabled: true,
  })
  tracker.startSession(
    { app_build: 'test', catalog_version: 'abcdef0123456789', policy_id: 'uniform_random', policy_version: '1', experiment_id: 'baseline', experiment_arm: 'uniform_random', assignment_probability: 1, locale: 'en-US', time_zone: 'UTC', utc_offset_minutes: 0, display_mode: 'browser', flags: { telemetry: true } },
    true,
  )
  tracker.updateContext({ schemaVersion: 1, reason: 'session_start', pool: { baseEnabled: true, enabledCategories: ['Travel'], consentedCategories: [], size: 140 }, group: { size: null, relationship: null }, ceilings: { spice: null }, dimensions: {} })
  const draw = { policyId: 'uniform_random', policyVersion: '1', probability: 1 / 140, candidateCount: 140, arcPhase: null }
  const card = (position: number, restored = false) => ({ questionId: 'base-00' + position, revisionId: `base-00${position}@0123456789ab`, category: null, source: 'original' as const, kind: 'question' as const, position, draw, restored })
  tracker.show(card(1))
  t += 3000
  tracker.setObscured(true)
  t += 1000
  tracker.setObscured(false)
  tracker.thumb('up')
  tracker.nominate()
  tracker.exit('next')
  tracker.show(card(2))
  t += 500
  tracker.exit('back')
  tracker.show(card(1)) // revisit
  tracker.setPageVisible(false) // then the page dies without an exit

  for (const { table, row } of produced) {
    try {
      await as('anon', null, () => insertRow(table, row))
    } catch (err) {
      throw new Error(`${table}: ${(err as Error).message}`)
    }
  }
  const tables = new Set(produced.map((p) => p.table))
  assert.equal(tables.size, 7)
})

test('a retried row fails as a duplicate (PostgREST 409), never a second copy', async () => {
  const impression = produced.find((p) => p.table === 'card_impressions')!
  await as('anon', null, () => rejects(() => insertRow('card_impressions', impression.row), /duplicate key/, 'retry'))
})

test('anon can never read, change or delete telemetry', async () => {
  for (const table of ['play_sessions', 'card_impressions', 'card_exits', 'conversation_nominations']) {
    const r = await as('anon', null, () => db.query(`select * from public.${table}`))
    assert.equal(r.rows.length, 0, table)
  }
  const views = await as('anon', null, () =>
    db.query(`select * from public.research_impressions`).then(() => 'readable', (e: Error) => e.message),
  )
  assert.match(views, /permission denied/)
  const upd = await as('anon', null, () => db.query(`update public.card_exits set visible_ms = 0`))
  assert.equal(upd.affectedRows ?? 0, 0)
})

test('telemetry constraints reject malformed rows', async () => {
  const base = produced.find((p) => p.table === 'card_impressions')!.row
  const revisitWithProbability = { ...base, impression_id: '40000000-0000-4000-8000-000000000001', display_seq: 99, display_kind: 'revisit', draw_impression_id: base.impression_id }
  await as('anon', null, () => rejects(() => insertRow('card_impressions', revisitWithProbability), /draws_carry_probability/, 'revisit with probability'))
  const exit = produced.find((p) => p.table === 'card_exits')!.row
  await as('anon', null, () =>
    rejects(() => insertRow('card_exits', { ...exit, impression_id: '40000000-0000-4000-8000-000000000002', exit_action: 'teleported' }), /foreign key/, 'unknown exit action'),
  )
  await as('anon', null, () =>
    rejects(() => insertRow('conversation_nominations', { ...produced.find((p) => p.table === 'conversation_nominations')!.row, event_id: '40000000-0000-4000-8000-000000000003', seq: 50, question_id: null }), /nominations_name_a_card/, 'nomination without a card'),
  )
})

test('research views: reported exits, inferred background exit, nomination in effect', async () => {
  const rows = await as('authenticated', ADMIN, () =>
    db.query<{ card_position: number; display_kind: string; exit_action: string; exit_source: string; visible_ms: number; obscured_ms: number; thumb_up: boolean }>(
      `select card_position, display_kind, exit_action, exit_source, visible_ms, obscured_ms, thumb_up
       from public.research_impressions order by display_seq`,
    ),
  )
  assert.deepEqual(rows.rows, [
    { card_position: 1, display_kind: 'draw', exit_action: 'next', exit_source: 'reported', visible_ms: 4000, obscured_ms: 1000, thumb_up: true },
    { card_position: 2, display_kind: 'draw', exit_action: 'back', exit_source: 'reported', visible_ms: 500, obscured_ms: 0, thumb_up: false },
    { card_position: 1, display_kind: 'revisit', exit_action: 'background', exit_source: 'inferred_from_visibility', visible_ms: 0, obscured_ms: 0, thumb_up: false },
  ])
  const nom = await as('authenticated', ADMIN, () => db.query<{ nominated: boolean; card_position: number }>(`select nominated, card_position from public.research_nominations`))
  assert.deepEqual(nom.rows, [{ nominated: true, card_position: 1 }])
})

test('a signed-in non-admin sees no telemetry and gets zeroes from health', async () => {
  const r = await as('authenticated', 'someone@example.com', () => db.query(`select * from public.research_impressions`))
  assert.equal(r.rows.length, 0)
  const h = await as('authenticated', 'someone@example.com', () => db.query<{ impressions: number }>(`select impressions::int from public.admin_telemetry_health()`))
  assert.equal(h.rows[0].impressions, 0)
})

test('telemetry health reports ingestion integrity for an admin', async () => {
  const h = await as('authenticated', ADMIN, () =>
    db.query(`select sessions::int, impressions::int, reported_exits::int, inferred_exits::int, superseded_exits::int,
                     impressions_without_session::int, draws_without_probability::int, nominations_in_effect::int, thumbs::int
              from public.admin_telemetry_health()`),
  )
  assert.deepEqual(h.rows[0], {
    sessions: 1,
    impressions: 3,
    reported_exits: 2,
    inferred_exits: 1,
    superseded_exits: 0,
    impressions_without_session: 0,
    draws_without_probability: 0,
    nominations_in_effect: 1,
    thumbs: 1,
  })
})

test('the editorial queue shows each submission with its latest decision and status', async () => {
  const q = await as('authenticated', ADMIN, () =>
    db.query<{ decision: string; question_id: string; status: string; current_text: string }>(`select decision, question_id, status, current_text from public.admin_editorial_queue()`),
  )
  assert.equal(q.rows.length, 1)
  assert.equal(q.rows[0].decision, 'accepted')
  assert.equal(q.rows[0].question_id, 'com-0001')
  assert.equal(q.rows[0].status, 'canon')
  assert.equal(q.rows[0].current_text, 'What hill would you die on?')
})

await run()
