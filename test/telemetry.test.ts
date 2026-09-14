/**
 * Telemetry: dwell timing, the session tracker's rules, and the outbox's
 * delivery guarantees — all against injected clocks, ids and transports.
 */
import assert from 'node:assert/strict'
import { DwellClock } from '../src/telemetry/dwell'
import { SessionTracker, type CardDisplay, type TelemetrySink } from '../src/telemetry/tracker'
import { Outbox, type StorageLike, type Transport } from '../src/telemetry/outbox'
import { PRIMARY_KEY, type TelemetryRows, type TelemetryTable } from '../src/telemetry/schema'
import { parseFlagList, resolveFlags, FLAG_DEFAULTS } from '../src/flags'
import { suite } from './harness'

const test = suite('telemetry')

/* --------------------------------------------------------------- dwell --- */

function fakeClock(start = 1000) {
  let t = start
  return { now: () => t, tick: (ms: number) => (t += ms) }
}

test('dwell counts visible time and pauses while the page is hidden', () => {
  const c = fakeClock()
  const d = new DwellClock(c.now, true)
  c.tick(3000)
  d.setPageVisible(false)
  c.tick(60_000)
  d.setPageVisible(true)
  c.tick(2000)
  assert.deepEqual(d.read(), { visibleMs: 5000, obscuredMs: 0, hiddenMs: 60_000, elapsedMs: 65_000 })
})

test('dwell tracks obscured time as a subset of visible time', () => {
  const c = fakeClock()
  const d = new DwellClock(c.now, true)
  c.tick(1000)
  d.setObscured(true)
  c.tick(4000)
  d.setPageVisible(false) // hidden while the menu is open: not visible, not obscured
  c.tick(10_000)
  d.setPageVisible(true)
  c.tick(500)
  d.setObscured(false)
  c.tick(1500)
  assert.deepEqual(d.read(), { visibleMs: 7000, obscuredMs: 4500, hiddenMs: 10_000, elapsedMs: 17_000 })
})

test('dwell starting hidden accrues nothing visible until shown', () => {
  const c = fakeClock()
  const d = new DwellClock(c.now, false)
  c.tick(2000)
  d.setPageVisible(true)
  c.tick(1234.4)
  assert.equal(d.read().visibleMs, 1234)
  assert.equal(d.read().hiddenMs, 2000)
})

test('dwell is frozen once stopped, and repeated state reports are no-ops', () => {
  const c = fakeClock()
  const d = new DwellClock(c.now, true)
  assert.equal(d.setPageVisible(true), false)
  c.tick(800)
  const stopped = d.stop()
  c.tick(5000)
  assert.equal(d.setPageVisible(false), false)
  assert.deepEqual(d.read(), stopped)
  assert.equal(stopped.visibleMs, 800)
})

test('dwell never goes negative if the monotonic clock misbehaves', () => {
  let t = 5000
  const d = new DwellClock(() => t, true)
  t = 4000
  assert.equal(d.read().visibleMs, 0)
  t = 4500
  assert.equal(d.read().visibleMs, 0)
  t = 6000
  assert.equal(d.read().visibleMs, 1000)
})

/* ------------------------------------------------------------- tracker --- */

type Sent = { table: TelemetryTable; row: Record<string, unknown>; urgent: boolean }

function harness(options: { enabled?: boolean } = {}) {
  const c = fakeClock()
  let id = 0
  let wall = 0
  const sent: Sent[] = []
  const sink: TelemetrySink = {
    send(table, row, opts) {
      sent.push({ table, row: row as Record<string, unknown>, urgent: opts?.urgent === true })
    },
  }
  const tracker = new SessionTracker({
    monotonicNow: c.now,
    wallNow: () => new Date(Date.UTC(2026, 8, 13, 20, 0, 0) + wall++).toISOString(),
    uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    sink,
    deviceId: 'device-1',
    sessionId: 'session-1',
    isTest: () => false,
    enabled: options.enabled ?? true,
  })
  const of = (table: TelemetryTable) => sent.filter((s) => s.table === table).map((s) => s.row)
  return { tracker, sent, of, clock: c }
}

const INFO = {
  app_build: null,
  catalog_version: 'abcdef0123456789',
  policy_id: 'uniform_random',
  policy_version: '1',
  experiment_id: 'baseline',
  experiment_arm: 'uniform_random',
  assignment_probability: 1,
  locale: 'en-US',
  time_zone: 'America/Chicago',
  utc_offset_minutes: -300,
  display_mode: 'browser' as const,
  flags: {},
}

const CONTEXT = {
  schemaVersion: 1 as const,
  reason: 'session_start' as const,
  pool: { baseEnabled: true, enabledCategories: [], consentedCategories: [], size: 113 },
  group: { size: null, relationship: null },
  ceilings: { spice: null },
  dimensions: {},
}

function card(position: number, over: Partial<CardDisplay> = {}): CardDisplay {
  return {
    questionId: `base-${String(position).padStart(3, '0')}`,
    revisionId: `base-${String(position).padStart(3, '0')}@0123456789ab`,
    category: null,
    source: 'original',
    kind: 'question',
    position,
    draw: { policyId: 'uniform_random', policyVersion: '1', probability: 1 / (114 - position), candidateCount: 114 - position, arcPhase: null },
    ...over,
  }
}

function started() {
  const h = harness()
  h.tracker.startSession(INFO, true)
  h.tracker.updateContext(CONTEXT)
  return h
}

test('nothing is recorded before the session starts, or ever when disabled', () => {
  const h = harness()
  h.tracker.updateContext(CONTEXT)
  h.tracker.show(card(1))
  h.tracker.exit('next')
  assert.equal(h.sent.length, 0)

  const off = harness({ enabled: false })
  off.tracker.startSession(INFO, true)
  off.tracker.updateContext(CONTEXT)
  off.tracker.show(card(1))
  off.tracker.nominate()
  assert.equal(off.sent.length, 0)
})

test('a session row, then one context snapshot, then impressions that reference it', () => {
  const h = started()
  h.tracker.startSession(INFO, true) // idempotent
  const id = h.tracker.show(card(1))
  assert.equal(h.of('play_sessions').length, 1)
  assert.equal(h.of('context_snapshots').length, 1)
  const [impression] = h.of('card_impressions')
  assert.equal(impression.impression_id, id)
  assert.equal(impression.snapshot_id, h.of('context_snapshots')[0].snapshot_id)
  assert.equal(impression.session_id, 'session-1')
  assert.equal(impression.device_id, 'device-1')
  assert.equal(impression.display_kind, 'draw')
  assert.equal(impression.card_position, 1)
  assert.equal(impression.display_seq, 1)
  assert.equal(impression.selection_probability, 1 / 113)
  assert.equal(impression.candidate_count, 113)
  assert.equal(impression.telemetry_schema_version, 1)
})

test('an unchanged room records no new snapshot; a changed one does', () => {
  const h = started()
  h.tracker.updateContext({ ...CONTEXT, reason: 'pool_changed' })
  assert.equal(h.of('context_snapshots').length, 1)
  h.tracker.updateContext({ ...CONTEXT, reason: 'pool_changed', pool: { ...CONTEXT.pool, size: 140, enabledCategories: ['Travel'] } })
  const snaps = h.of('context_snapshots')
  assert.equal(snaps.length, 2)
  assert.equal(snaps[1].seq, 1)
  assert.equal(snaps[1].reason, 'pool_changed')
  assert.deepEqual(snaps[1].enabled_categories, ['Travel'])
  assert.equal(snaps[1].group_size, null)
})

test('every impression gets exactly one exit, with the dwell of that card', () => {
  const h = started()
  const first = h.tracker.show(card(1))
  h.clock.tick(4200)
  h.tracker.exit('next')
  h.tracker.exit('next') // nothing open: no-op
  h.tracker.show(card(2))
  h.clock.tick(900)
  h.tracker.exit('back')
  const exits = h.of('card_exits')
  assert.equal(exits.length, 2)
  assert.equal(exits[0].impression_id, first)
  assert.equal(exits[0].exit_action, 'next')
  assert.equal(exits[0].visible_ms, 4200)
  assert.equal(exits[1].exit_action, 'back')
  assert.equal(exits[1].visible_ms, 900)
})

test('showing the card already open is a no-op (StrictMode double effects)', () => {
  const h = started()
  const a = h.tracker.show(card(1))
  const b = h.tracker.show(card(1))
  assert.equal(a, b)
  assert.equal(h.of('card_impressions').length, 1)
})

test('showing a different card without an exit closes the old one as superseded', () => {
  const h = started()
  h.tracker.show(card(1))
  h.tracker.show(card(2))
  assert.equal(h.of('card_exits')[0].exit_action, 'superseded')
})

test('revisits reference the original draw and carry no selection probability', () => {
  const h = started()
  const draw1 = h.tracker.show(card(1))
  h.tracker.exit('next')
  h.tracker.show(card(2))
  h.tracker.exit('back')
  h.tracker.show(card(1))
  const [, , revisit] = h.of('card_impressions')
  assert.equal(revisit.display_kind, 'revisit')
  assert.equal(revisit.draw_impression_id, draw1)
  assert.equal(revisit.selection_probability, null)
  assert.equal(revisit.candidate_count, null)
  assert.equal(revisit.display_seq, 3)
})

test('a card re-shown after the pool was emptied is a redisplay', () => {
  const h = started()
  h.tracker.show(card(1))
  h.tracker.exit('pool_emptied')
  h.tracker.show(card(1, { restored: true }))
  const [, redisplay] = h.of('card_impressions')
  assert.equal(h.of('card_exits')[0].exit_action, 'pool_emptied')
  assert.equal(redisplay.display_kind, 'redisplay')
})

test('hiding the page pauses dwell and sends an urgent visibility event', () => {
  const h = started()
  h.tracker.show(card(1))
  h.clock.tick(2000)
  h.tracker.setPageVisible(false)
  h.clock.tick(30_000)
  h.tracker.setPageVisible(true)
  h.clock.tick(1000)
  h.tracker.exit('next')
  const vis = h.sent.filter((s) => s.table === 'card_visibility_events')
  assert.deepEqual(vis.map((v) => v.row.state), ['hidden', 'visible'])
  assert.equal(vis[0].urgent, true)
  assert.equal(vis[0].row.visible_ms, 2000)
  const [exit] = h.of('card_exits')
  assert.equal(exit.visible_ms, 3000)
  assert.equal(exit.hidden_ms, 30_000)
})

test('the menu covering a card is recorded as obscured time', () => {
  const h = started()
  h.tracker.show(card(1))
  h.tracker.setObscured(true)
  h.clock.tick(5000)
  h.tracker.setObscured(false)
  h.tracker.exit('next')
  assert.deepEqual(h.of('card_visibility_events').map((v) => v.state), ['obscured', 'unobscured'])
  assert.equal(h.of('card_exits')[0].obscured_ms, 5000)
})

test('a card shown while the menu is already open starts obscured', () => {
  const h = started()
  h.tracker.setObscured(true)
  h.tracker.show(card(1))
  h.clock.tick(700)
  h.tracker.exit('next')
  assert.equal(h.of('card_exits')[0].obscured_ms, 700)
})

test('teardown exits as background when hidden, session_abandoned when visible', () => {
  const a = started()
  a.tracker.show(card(1))
  a.tracker.teardown()
  assert.equal(a.of('card_exits')[0].exit_action, 'session_abandoned')
  assert.equal(a.sent.find((s) => s.table === 'card_exits')!.urgent, true)

  const b = started()
  b.tracker.show(card(1))
  b.tracker.setPageVisible(false)
  b.tracker.teardown()
  assert.equal(b.of('card_exits')[0].exit_action, 'background')
})

test('thumbs attach to the exact impression and revision', () => {
  const h = started()
  const id = h.tracker.show(card(3))
  h.tracker.thumb('up')
  const [f] = h.of('impression_feedback')
  assert.equal(f.impression_id, id)
  assert.equal(f.revision_id, 'base-003@0123456789ab')
  assert.equal(f.kind, 'thumb')
  assert.equal(f.value, 'up')
})

test('one nomination per session: a new one replaces, re-nominating is a no-op, clear withdraws', () => {
  const h = started()
  h.tracker.show(card(1))
  h.tracker.nominate()
  h.tracker.nominate() // same card
  h.tracker.exit('next')
  h.tracker.show(card(2))
  h.tracker.nominate() // replaces
  h.tracker.exit('back')
  h.tracker.show(card(1))
  h.tracker.exit('next')
  h.tracker.show(card(2))
  h.tracker.nominate() // revisit of the nominated card: no-op
  assert.equal(h.tracker.nomination, 2)
  h.tracker.clearNomination()
  h.tracker.clearNomination() // nothing to clear
  const events = h.of('conversation_nominations')
  assert.deepEqual(events.map((e) => e.action), ['nominate', 'nominate', 'clear'])
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3])
  assert.equal(events[1].card_position, 2)
  assert.equal(events[2].impression_id, null)
  assert.equal(h.tracker.nomination, null)
})

test('every row carries the primary key its table declares', () => {
  const h = started()
  h.tracker.show(card(1))
  h.tracker.setPageVisible(false)
  h.tracker.setPageVisible(true)
  h.tracker.thumb('down')
  h.tracker.nominate()
  h.tracker.exit('next')
  const tables = new Set(h.sent.map((s) => s.table))
  assert.equal(tables.size, 7)
  for (const s of h.sent) {
    const key = PRIMARY_KEY[s.table]
    assert.ok(typeof s.row[key] === 'string' && (s.row[key] as string).length > 0, `${s.table}.${key}`)
    assert.equal(s.row.is_test, false)
    assert.equal(s.row.telemetry_schema_version, 1)
  }
})

/* --------------------------------------------------------------- outbox --- */

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

function row(n: number): TelemetryRows['card_exits'] {
  return {
    session_id: 's',
    device_id: 'd',
    is_test: false,
    telemetry_schema_version: 1,
    impression_id: `imp-${n}`,
    exit_action: 'next',
    dismissed_at: '2026-09-13T20:00:00Z',
    visible_ms: n,
    obscured_ms: 0,
    hidden_ms: 0,
    elapsed_ms: n,
  }
}

function outboxWith(responses: (rows: Record<string, unknown>[]) => number | 'disabled', storage = memoryStorage()) {
  const calls: { table: string; ids: unknown[]; keepalive: boolean }[] = []
  const timers: { fn: () => void; ms: number }[] = []
  let now = 1_000_000
  const transport: Transport = async (table, rows, { keepalive }) => {
    calls.push({ table, ids: rows.map((r) => r.impression_id), keepalive })
    return responses(rows)
  }
  const outbox = new Outbox({
    transport,
    storage,
    now: () => now,
    schedule: (fn, ms) => void timers.push({ fn, ms }),
    maxEntries: 5,
    maxAgeMs: 10_000,
  })
  return { outbox, calls, timers, storage, advance: (ms: number) => (now += ms) }
}

test('outbox batches by table and clears on success', async () => {
  const o = outboxWith(() => 201)
  o.outbox.enqueue('card_exits', row(1))
  o.outbox.enqueue('card_exits', row(2))
  assert.equal(o.timers.length, 1, 'one debounced flush, not one per row')
  await o.outbox.flush()
  assert.equal(o.calls.length, 1)
  assert.deepEqual(o.calls[0].ids, ['imp-1', 'imp-2'])
  assert.equal(o.outbox.size, 0)
  assert.equal(o.storage.data.size, 0)
})

test('outbox keeps rows through a network failure, persists them, and retries with backoff', async () => {
  let online = false
  const o = outboxWith(() => (online ? 201 : 0))
  // Urgent, so no debounce timer is pending — the only timer is the retry.
  o.outbox.enqueue('card_exits', row(1), { urgent: true })
  await o.outbox.flush()
  assert.equal(o.outbox.size, 1)
  assert.ok(o.storage.data.get('stt.telemetry.outbox.v1')!.includes('imp-1'))
  assert.ok(o.timers.some((t) => t.ms >= 2000), 'a retry was scheduled')
  online = true
  await o.outbox.flush()
  assert.equal(o.outbox.size, 0)
})

test('outbox treats 409 as already delivered, isolating it within a batch', async () => {
  const o = outboxWith((rows) => (rows.length > 1 ? 409 : rows[0].impression_id === 'imp-2' ? 409 : 201))
  o.outbox.enqueue('card_exits', row(1))
  o.outbox.enqueue('card_exits', row(2))
  o.outbox.enqueue('card_exits', row(3))
  await o.outbox.flush()
  assert.equal(o.outbox.size, 0)
  assert.equal(o.calls.length, 4) // one batch, then three singles
})

test('outbox drops a row the database will never accept, without losing its neighbours', async () => {
  const delivered: unknown[] = []
  const o = outboxWith((rows) => {
    if (rows.length > 1) return 400
    if (rows[0].impression_id === 'imp-2') return 400
    delivered.push(rows[0].impression_id)
    return 201
  })
  o.outbox.enqueue('card_exits', row(1))
  o.outbox.enqueue('card_exits', row(2))
  o.outbox.enqueue('card_exits', row(3))
  await o.outbox.flush()
  assert.deepEqual(delivered, ['imp-1', 'imp-3'])
  assert.equal(o.outbox.size, 0)
})

test('outbox discards everything when writes are disabled for this page (dev, preview)', async () => {
  const o = outboxWith(() => 'disabled')
  o.outbox.enqueue('card_exits', row(1))
  await o.outbox.flush()
  assert.equal(o.outbox.size, 0)
  assert.equal(o.storage.data.size, 0)
})

test('outbox is bounded by count and by age', async () => {
  const o = outboxWith(() => 0)
  for (let i = 1; i <= 8; i++) o.outbox.enqueue('card_exits', row(i))
  assert.equal(o.outbox.size, 5)
  o.advance(20_000)
  await o.outbox.flush()
  assert.equal(o.outbox.size, 0)
})

test('urgent rows flush immediately with keepalive', async () => {
  const o = outboxWith(() => 201)
  o.outbox.enqueue('card_exits', row(1), { urgent: true })
  await o.outbox.flush()
  assert.equal(o.calls[0].keepalive, true)
})

test('outbox restores rows persisted by an earlier visit', async () => {
  const storage = memoryStorage()
  const first = outboxWith(() => 0, storage)
  first.outbox.enqueue('card_exits', row(1))
  await first.outbox.flush()
  const second = outboxWith(() => 201, storage)
  assert.equal(second.outbox.size, 1)
  await second.outbox.flush()
  assert.deepEqual(second.calls[0].ids, ['imp-1'])
  assert.equal(storage.data.size, 0)
})

test('outbox coalesces concurrent flushes', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  let calls = 0
  const outbox = new Outbox({
    transport: async () => {
      calls += 1
      await gate
      return 201
    },
    storage: null,
    now: () => 0,
    schedule: () => {},
  })
  outbox.enqueue('card_exits', row(1))
  const a = outbox.flush()
  const b = outbox.flush()
  release()
  await Promise.all([a, b])
  assert.equal(calls, 1)
  assert.equal(outbox.size, 0)
})

/* ---------------------------------------------------------------- flags --- */

test('flags: defaults keep gameplay unchanged; overrides parse and layer', () => {
  assert.equal(FLAG_DEFAULTS.experimentalQuestions, false)
  assert.equal(FLAG_DEFAULTS.skipGesture, false)
  assert.equal(FLAG_DEFAULTS.telemetry, true)
  assert.deepEqual(parseFlagList(' experimentalQuestions , -onboarding, nonsense,,'), {
    experimentalQuestions: true,
    onboarding: false,
  })
  const f = resolveFlags({ onboarding: false, skipGesture: true }, { skipGesture: false })
  assert.equal(f.onboarding, false)
  assert.equal(f.skipGesture, false)
  assert.equal(f.telemetry, true)
})
