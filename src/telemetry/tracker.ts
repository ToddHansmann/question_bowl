/**
 * The telemetry state machine for one play session.
 *
 * It knows nothing about React, the DOM, or the network. The app reports what
 * happened — a card appeared, the player moved on, the page was hidden — and
 * the tracker turns that into immutable rows handed to a sink. Everything it
 * needs from the environment (clocks, ids) is injected, so every rule below
 * is unit-tested in test/telemetry.test.ts.
 *
 * Guarantees:
 * - At most one impression is open at a time.
 * - Every impression gets exactly one exit row, unless the page is torn down
 *   without warning (then analysis infers the exit — see the
 *   `research_impressions` view).
 * - Showing the card that is already open is a no-op (React StrictMode
 *   double-invokes effects in development).
 * - Nothing is recorded before `startSession`, or ever when disabled.
 */
import { DwellClock } from './dwell'
import {
  TELEMETRY_SCHEMA_VERSION,
  type CardImpressionRow,
  type ContextSnapshotRow,
  type DisplayKind,
  type ExitAction,
  type PlaySessionRow,
  type TelemetryRows,
  type TelemetryTable,
  type VisibilityState,
} from './schema'
import { sameContext } from '../recommendation/context'
import type { ContextSnapshot } from '../recommendation/types'
import type { DrawRecord } from '../deck'
import type { Category, Kind, Source } from '../questions'

export interface TelemetrySink {
  send<T extends TelemetryTable>(table: T, row: TelemetryRows[T], options?: { urgent?: boolean }): void
}

export type TrackerEnvironment = {
  /** Monotonic milliseconds (performance.now). */
  monotonicNow: () => number
  /** Wall clock, ISO 8601. */
  wallNow: () => string
  uuid: () => string
  sink: TelemetrySink
  deviceId: string
  sessionId: string
  isTest: () => boolean
  /** When false the tracker records nothing at all. */
  enabled: boolean
}

export type SessionInfo = Omit<
  PlaySessionRow,
  'session_id' | 'device_id' | 'is_test' | 'telemetry_schema_version' | 'started_at'
>

/** What the app knows about the card being put on screen. */
export type CardDisplay = {
  questionId: string
  revisionId: string
  category: Category | null
  source: Source
  kind: Kind
  /** 1-based position in this session's history. */
  position: number
  /** How that position was originally selected. */
  draw: DrawRecord | null
  /** True when re-showing a card after the deck was hidden (pool restored, page restored). */
  restored?: boolean
}

type OpenImpression = {
  id: string
  key: string
  questionId: string
  revisionId: string
  position: number
  clock: DwellClock
  visibilitySeq: number
}

export type ContextInputForTracker = Omit<ContextSnapshot, 'snapshotId' | 'sessionId' | 'seq' | 'capturedAt'>

export class SessionTracker {
  private readonly env: TrackerEnvironment
  private started = false
  private pageVisible = true
  private obscured = false
  private open: OpenImpression | null = null
  private displaySeq = 0
  private snapshotSeq = 0
  private nominationSeq = 0
  private currentSnapshot: ContextSnapshot | null = null
  /** position → the impression id of that position's `draw` display. */
  private readonly drawImpressionByPosition = new Map<number, string>()
  /** The history position nominated this session — a card, not one display of it. */
  private nominatedPosition: number | null = null

  constructor(env: TrackerEnvironment) {
    this.env = env
  }

  private common() {
    return {
      session_id: this.env.sessionId,
      device_id: this.env.deviceId,
      is_test: this.env.isTest(),
      telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
    }
  }

  private get active(): boolean {
    return this.env.enabled && this.started
  }

  get sessionStarted(): boolean {
    return this.started
  }

  get openImpressionId(): string | null {
    return this.open?.id ?? null
  }

  get snapshot(): ContextSnapshot | null {
    return this.currentSnapshot
  }

  /** Records the play session. Idempotent. */
  startSession(info: SessionInfo, pageVisible: boolean): void {
    if (!this.env.enabled || this.started) return
    this.started = true
    this.pageVisible = pageVisible
    const row: PlaySessionRow = { ...this.common(), started_at: this.env.wallNow(), ...info }
    this.env.sink.send('play_sessions', row)
  }

  /**
   * Records a new context snapshot if the room changed. Returns the snapshot
   * now current. The first call after `startSession` always records.
   */
  updateContext(input: ContextInputForTracker): ContextSnapshot | null {
    if (!this.active) return null
    const candidate: ContextSnapshot = {
      ...input,
      snapshotId: this.env.uuid(),
      sessionId: this.env.sessionId,
      seq: this.snapshotSeq,
      capturedAt: this.env.wallNow(),
    }
    if (this.currentSnapshot && sameContext(this.currentSnapshot, candidate)) return this.currentSnapshot
    this.snapshotSeq += 1
    this.currentSnapshot = candidate
    const row: ContextSnapshotRow = {
      ...this.common(),
      snapshot_id: candidate.snapshotId,
      seq: candidate.seq,
      captured_at: candidate.capturedAt,
      reason: candidate.reason,
      context_schema_version: candidate.schemaVersion,
      base_enabled: candidate.pool.baseEnabled,
      enabled_categories: [...candidate.pool.enabledCategories],
      consented_categories: [...candidate.pool.consentedCategories],
      pool_size: candidate.pool.size,
      group_size: candidate.group.size,
      relationship: candidate.group.relationship,
      spice_ceiling: candidate.ceilings.spice,
      dimensions: { ...candidate.dimensions },
    }
    this.env.sink.send('context_snapshots', row)
    return candidate
  }

  /** A card is now on screen. Returns its impression id (or null when not recording). */
  show(card: CardDisplay): string | null {
    if (!this.active) return null
    const key = `${card.position}:${card.revisionId}:${card.restored ? 'r' : ''}`
    if (this.open) {
      if (this.open.key === key) return this.open.id
      this.exit('superseded')
    }

    let displayKind: DisplayKind
    const drawImpression = this.drawImpressionByPosition.get(card.position) ?? null
    if (drawImpression === null) displayKind = 'draw'
    else displayKind = card.restored ? 'redisplay' : 'revisit'

    const id = this.env.uuid()
    if (displayKind === 'draw') this.drawImpressionByPosition.set(card.position, id)
    this.displaySeq += 1

    const isDraw = displayKind === 'draw'
    const row: CardImpressionRow = {
      ...this.common(),
      impression_id: id,
      snapshot_id: this.currentSnapshot?.snapshotId ?? null,
      display_seq: this.displaySeq,
      card_position: card.position,
      display_kind: displayKind,
      draw_impression_id: isDraw ? null : drawImpression,
      question_id: card.questionId,
      revision_id: card.revisionId,
      category: card.category,
      source: card.source,
      kind: card.kind,
      policy_id: card.draw?.policyId ?? null,
      policy_version: card.draw?.policyVersion ?? null,
      // Only a draw was a policy decision; a revisit carries no probability.
      selection_probability: isDraw ? (card.draw?.probability ?? null) : null,
      candidate_count: isDraw ? (card.draw?.candidateCount ?? null) : null,
      arc_phase: card.draw?.arcPhase ?? null,
      shown_at: this.env.wallNow(),
      page_visible_at_show: this.pageVisible,
    }
    this.open = {
      id,
      key,
      questionId: card.questionId,
      revisionId: card.revisionId,
      position: card.position,
      clock: new DwellClock(this.env.monotonicNow, this.pageVisible, this.obscured),
      visibilitySeq: 0,
    }
    this.env.sink.send('card_impressions', row)
    return id
  }

  /** The open card left the screen. No-op when nothing is open. */
  exit(action: ExitAction, options: { urgent?: boolean } = {}): void {
    const open = this.open
    if (!this.active || !open) return
    this.open = null
    const reading = open.clock.stop()
    this.env.sink.send(
      'card_exits',
      {
        ...this.common(),
        impression_id: open.id,
        exit_action: action,
        dismissed_at: this.env.wallNow(),
        visible_ms: reading.visibleMs,
        obscured_ms: reading.obscuredMs,
        hidden_ms: reading.hiddenMs,
        elapsed_ms: reading.elapsedMs,
      },
      options,
    )
  }

  /** Page visibility changed (tab switch, app backgrounded, screen lock). */
  setPageVisible(visible: boolean): void {
    if (this.pageVisible === visible) return
    this.pageVisible = visible
    if (!this.active || !this.open) return
    if (this.open.clock.setPageVisible(visible)) {
      // A hide is urgent: it may be the last chance this page gets to send.
      this.recordVisibility(visible ? 'visible' : 'hidden', { urgent: !visible })
    }
  }

  /** Something covered the card (the menu), or stopped covering it. */
  setObscured(obscured: boolean): void {
    if (this.obscured === obscured) return
    this.obscured = obscured
    if (!this.active || !this.open) return
    if (this.open.clock.setObscured(obscured)) this.recordVisibility(obscured ? 'obscured' : 'unobscured')
  }

  private recordVisibility(state: VisibilityState, options: { urgent?: boolean } = {}): void {
    const open = this.open
    if (!open) return
    const reading = open.clock.read()
    open.visibilitySeq += 1
    this.env.sink.send(
      'card_visibility_events',
      {
        ...this.common(),
        event_id: this.env.uuid(),
        impression_id: open.id,
        seq: open.visibilitySeq,
        state,
        occurred_at: this.env.wallNow(),
        visible_ms: reading.visibleMs,
        obscured_ms: reading.obscuredMs,
        hidden_ms: reading.hiddenMs,
      },
      options,
    )
  }

  /**
   * The page is being torn down (pagehide). Closes the open impression as
   * `background` if the page was already hidden, else `session_abandoned`.
   */
  teardown(): void {
    this.exit(this.pageVisible ? 'session_abandoned' : 'background', { urgent: true })
  }

  /** A thumbs up/down on the open card. */
  thumb(value: 'up' | 'down'): void {
    const open = this.open
    if (!this.active || !open) return
    this.env.sink.send('impression_feedback', {
      ...this.common(),
      feedback_id: this.env.uuid(),
      impression_id: open.id,
      question_id: open.questionId,
      revision_id: open.revisionId,
      kind: 'thumb',
      value,
      occurred_at: this.env.wallNow(),
    })
  }

  /** The history position currently nominated as this session's best conversation, if any. */
  get nomination(): number | null {
    return this.nominatedPosition
  }

  /**
   * Nominates the open card as the best conversation of the session,
   * replacing any earlier nomination. Nominating the card that is already
   * nominated (even on a later revisit of it) is a no-op.
   */
  nominate(): void {
    const open = this.open
    if (!this.active || !open || this.nominatedPosition === open.position) return
    this.nominatedPosition = open.position
    this.nominationSeq += 1
    this.env.sink.send('conversation_nominations', {
      ...this.common(),
      event_id: this.env.uuid(),
      seq: this.nominationSeq,
      action: 'nominate',
      impression_id: open.id,
      question_id: open.questionId,
      revision_id: open.revisionId,
      card_position: open.position,
      occurred_at: this.env.wallNow(),
    })
  }

  /** Withdraws the session's nomination. */
  clearNomination(): void {
    if (!this.active || this.nominatedPosition === null) return
    this.nominatedPosition = null
    this.nominationSeq += 1
    this.env.sink.send('conversation_nominations', {
      ...this.common(),
      event_id: this.env.uuid(),
      seq: this.nominationSeq,
      action: 'clear',
      impression_id: null,
      question_id: null,
      revision_id: null,
      card_position: null,
      occurred_at: this.env.wallNow(),
    })
  }
}
