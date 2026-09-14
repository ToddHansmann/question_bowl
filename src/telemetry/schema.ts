/**
 * Telemetry row shapes — the client half of the contract in
 * docs/telemetry-spec.md and supabase/migrations/*_telemetry.sql.
 *
 * Field names are snake_case because they are column names. Every row is an
 * immutable fact, written once, insert-only; nothing here is ever updated.
 * Nothing here is a score.
 *
 * Changing this file:
 * - Adding an optional field: add the column (nullable) in a migration first,
 *   deploy the migration, then ship the client. Bump nothing.
 * - Changing the meaning of a field: don't. Add a new field.
 * - Any change that alters how an existing field is *measured* (e.g. a new
 *   dwell definition): bump `TELEMETRY_SCHEMA_VERSION`, so analysis can split
 *   history at the change.
 */

export const TELEMETRY_SCHEMA_VERSION = 1

/**
 * How a card left the screen. Stored as text against the `exit_actions`
 * lookup table, so adding one is an INSERT, not a schema change.
 *
 * - `next`              — moved forward (swipe left, →-equivalent keys).
 * - `skip`              — explicitly passed on it. No gesture emits this yet
 *                         (`skipGesture` flag); reserved so it is never
 *                         conflated with `next`.
 * - `back`              — returned to the previous card.
 * - `reroll`            — replaced without advancing. No control emits this yet.
 * - `background`        — the page was hidden when it was torn down.
 * - `session_abandoned` — the page was closed or navigated away while visible.
 * - `pool_emptied`      — every pack was switched off, so no card is showing.
 * - `superseded`        — a new card was shown without the old one being
 *                         closed. Should never occur; a non-zero count is a
 *                         client bug.
 */
export const EXIT_ACTIONS = [
  'next',
  'skip',
  'back',
  'reroll',
  'background',
  'session_abandoned',
  'pool_emptied',
  'superseded',
] as const
export type ExitAction = (typeof EXIT_ACTIONS)[number]

/**
 * - `draw`      — first time this history position is shown; the policy chose it.
 * - `revisit`   — navigated back (or forward again) to a card already dealt.
 * - `redisplay` — the same card shown again after the deck was hidden
 *                 (pool emptied then restored, or restored from the
 *                 back/forward cache). Not a new choice.
 */
export type DisplayKind = 'draw' | 'revisit' | 'redisplay'

export type VisibilityState = 'hidden' | 'visible' | 'obscured' | 'unobscured'

type Common = {
  session_id: string
  device_id: string
  is_test: boolean
  telemetry_schema_version: number
}

export type PlaySessionRow = Common & {
  started_at: string
  app_build: string | null
  catalog_version: string
  policy_id: string
  policy_version: string
  /** Which experiment arm this session was assigned to. Every session is 'baseline' today. */
  experiment_id: string
  experiment_arm: string
  assignment_probability: number
  locale: string | null
  time_zone: string | null
  utc_offset_minutes: number | null
  display_mode: 'standalone' | 'browser' | null
  flags: Record<string, boolean>
}

export type ContextSnapshotRow = Common & {
  snapshot_id: string
  seq: number
  captured_at: string
  reason: string
  context_schema_version: number
  base_enabled: boolean
  enabled_categories: string[]
  consented_categories: string[]
  pool_size: number
  group_size: number | null
  relationship: string | null
  spice_ceiling: string | null
  dimensions: Record<string, string | number | boolean | null>
}

export type CardImpressionRow = Common & {
  impression_id: string
  snapshot_id: string | null
  display_seq: number
  card_position: number
  display_kind: DisplayKind
  draw_impression_id: string | null
  question_id: string
  revision_id: string
  category: string | null
  source: string
  kind: string
  policy_id: string | null
  policy_version: string | null
  selection_probability: number | null
  candidate_count: number | null
  arc_phase: string | null
  shown_at: string
  page_visible_at_show: boolean
}

export type CardVisibilityEventRow = Common & {
  event_id: string
  impression_id: string
  seq: number
  state: VisibilityState
  occurred_at: string
  visible_ms: number
  obscured_ms: number
  hidden_ms: number
}

export type CardExitRow = Common & {
  impression_id: string
  exit_action: ExitAction
  dismissed_at: string
  visible_ms: number
  obscured_ms: number
  hidden_ms: number
  elapsed_ms: number
}

export type ImpressionFeedbackRow = Common & {
  feedback_id: string
  impression_id: string
  question_id: string
  revision_id: string
  kind: 'thumb'
  value: string
  occurred_at: string
}

export type ConversationNominationRow = Common & {
  event_id: string
  seq: number
  action: 'nominate' | 'clear'
  impression_id: string | null
  question_id: string | null
  revision_id: string | null
  card_position: number | null
  occurred_at: string
}

export type TelemetryRows = {
  play_sessions: PlaySessionRow
  context_snapshots: ContextSnapshotRow
  card_impressions: CardImpressionRow
  card_visibility_events: CardVisibilityEventRow
  card_exits: CardExitRow
  impression_feedback: ImpressionFeedbackRow
  conversation_nominations: ConversationNominationRow
}

export type TelemetryTable = keyof TelemetryRows

/**
 * Per table, the column that uniquely identifies a row. Rows carry
 * client-generated ids so a retry can never create a duplicate: the database
 * answers a repeat with 409, which the outbox treats as delivered.
 */
export const PRIMARY_KEY: { readonly [T in TelemetryTable]: keyof TelemetryRows[T] & string } = {
  play_sessions: 'session_id',
  context_snapshots: 'snapshot_id',
  card_impressions: 'impression_id',
  card_visibility_events: 'event_id',
  card_exits: 'impression_id',
  impression_feedback: 'feedback_id',
  conversation_nominations: 'event_id',
}
