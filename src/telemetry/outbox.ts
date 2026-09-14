/**
 * The telemetry outbox — delivery that survives bad Wi-Fi.
 *
 * Sip the Tea is played at parties, in basements, on trains. A telemetry row
 * that fails to send is kept (in memory, and mirrored to localStorage when a
 * storage is supplied) and retried later — on the next flush, when the
 * browser reports it's back online, or on the next visit.
 *
 * Idempotency comes from the rows themselves: every row carries a
 * client-generated primary key, so a retry of a row that actually arrived
 * gets a 409 from the database, which the outbox counts as delivered.
 *
 * Failure handling, per attempt:
 * - 2xx, 409          → delivered, removed.
 * - 'disabled'        → this page must never write (dev, preview) → removed.
 * - 0, 408, 429, 5xx  → transient → kept, retried with backoff.
 * - any other 4xx     → the row itself is bad (or the table isn't deployed
 *                       yet) → a batch is split so one bad row can't sink
 *                       its neighbours; a single bad row is dropped rather
 *                       than retried forever.
 *
 * Bounded: at most `maxEntries` rows (oldest dropped first) and none older
 * than `maxAgeMs`. Telemetry must never grow without limit on a player's
 * phone.
 *
 * Pure with respect to the environment — transport, storage, clock and timer
 * are injected — so every rule above is unit-tested.
 */
import type { InsertStatus } from '../supabase'
import type { TelemetryRows, TelemetryTable } from './schema'

export type Transport = (
  table: TelemetryTable,
  rows: Record<string, unknown>[],
  options: { keepalive: boolean },
) => Promise<InsertStatus>

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type Entry = {
  table: TelemetryTable
  row: Record<string, unknown>
  enqueuedAt: number
  attempts: number
}

export type OutboxOptions = {
  transport: Transport
  storage: StorageLike | null
  now: () => number
  schedule: (fn: () => void, ms: number) => void
  storageKey?: string
  maxEntries?: number
  maxAgeMs?: number
  batchSize?: number
  /** Keepalive requests share a ~64KB budget; keep urgent batches small. */
  urgentBatchSize?: number
  debounceMs?: number
}

const TRANSIENT = (status: InsertStatus) =>
  status === 0 || status === 408 || status === 429 || (typeof status === 'number' && status >= 500)

export class Outbox {
  private readonly o: Required<OutboxOptions>
  private entries: Entry[] = []
  private flushing: Promise<void> | null = null
  private pendingAgain = false
  private scheduled = false
  private backoffAttempts = 0

  constructor(options: OutboxOptions) {
    this.o = {
      storageKey: 'stt.telemetry.outbox.v1',
      maxEntries: 1000,
      maxAgeMs: 14 * 24 * 60 * 60 * 1000,
      batchSize: 50,
      urgentBatchSize: 10,
      debounceMs: 1500,
      ...options,
    }
    this.load()
  }

  get size(): number {
    return this.entries.length
  }

  enqueue<T extends TelemetryTable>(table: T, row: TelemetryRows[T], options: { urgent?: boolean } = {}): void {
    this.entries.push({ table, row: row as Record<string, unknown>, enqueuedAt: this.o.now(), attempts: 0 })
    this.prune()
    this.persist()
    if (options.urgent) void this.flush({ keepalive: true })
    else this.scheduleFlush(this.o.debounceMs)
  }

  /** Sends everything queued. Concurrent calls coalesce into one extra pass. */
  flush(options: { keepalive?: boolean } = {}): Promise<void> {
    if (this.flushing) {
      this.pendingAgain = true
      return this.flushing
    }
    this.flushing = this.run(options.keepalive === true).finally(() => {
      this.flushing = null
      if (this.pendingAgain) {
        this.pendingAgain = false
        void this.flush(options)
      }
    })
    return this.flushing
  }

  private scheduleFlush(ms: number): void {
    if (this.scheduled) return
    this.scheduled = true
    this.o.schedule(() => {
      this.scheduled = false
      void this.flush()
    }, ms)
  }

  private async run(keepalive: boolean): Promise<void> {
    this.prune()
    const size = keepalive ? this.o.urgentBatchSize : this.o.batchSize
    const byTable = new Map<TelemetryTable, Entry[]>()
    for (const e of this.entries) {
      const list = byTable.get(e.table) ?? []
      list.push(e)
      byTable.set(e.table, list)
    }

    let transientFailure = false
    for (const [table, list] of byTable) {
      for (let i = 0; i < list.length && !transientFailure; i += size) {
        const outcome = await this.sendBatch(table, list.slice(i, i + size), keepalive)
        if (outcome === 'transient') transientFailure = true
      }
      if (transientFailure) break
    }
    this.persist()

    if (transientFailure) {
      this.backoffAttempts += 1
      this.scheduleFlush(Math.min(60_000, 2_000 * 2 ** Math.min(this.backoffAttempts, 5)))
    } else {
      this.backoffAttempts = 0
    }
  }

  private async sendBatch(table: TelemetryTable, batch: Entry[], keepalive: boolean): Promise<'ok' | 'transient'> {
    const status = await this.o.transport(
      table,
      batch.map((e) => e.row),
      { keepalive },
    )
    const delivered =
      status === 'disabled' ||
      (typeof status === 'number' && status >= 200 && status < 300) ||
      (status === 409 && batch.length === 1)
    if (delivered) {
      this.remove(batch)
      return 'ok'
    }
    if (TRANSIENT(status)) {
      for (const e of batch) e.attempts += 1
      return 'transient'
    }
    // A 409 on a batch (one row already there) or a 4xx: isolate row by row.
    if (batch.length > 1) {
      for (const e of batch) {
        const outcome = await this.sendBatch(table, [e], keepalive)
        if (outcome === 'transient') return 'transient'
      }
      return 'ok'
    }
    // A single row the database will never accept. Don't retry it forever.
    this.remove(batch)
    return 'ok'
  }

  private remove(batch: Entry[]): void {
    const gone = new Set(batch)
    this.entries = this.entries.filter((e) => !gone.has(e))
  }

  private prune(): void {
    const cutoff = this.o.now() - this.o.maxAgeMs
    this.entries = this.entries.filter((e) => e.enqueuedAt >= cutoff)
    if (this.entries.length > this.o.maxEntries) this.entries = this.entries.slice(-this.o.maxEntries)
  }

  private persist(): void {
    if (!this.o.storage) return
    try {
      if (this.entries.length === 0) this.o.storage.removeItem(this.o.storageKey)
      else this.o.storage.setItem(this.o.storageKey, JSON.stringify(this.entries))
    } catch {
      // Quota or storage blocked — the in-memory queue still delivers this visit.
    }
  }

  private load(): void {
    if (!this.o.storage) return
    try {
      const raw = this.o.storage.getItem(this.o.storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Entry[]
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(
          (e) => e && typeof e.table === 'string' && e.row && typeof e.enqueuedAt === 'number',
        )
        this.prune()
      }
    } catch {
      this.entries = []
    }
  }
}
