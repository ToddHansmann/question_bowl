/**
 * The recommendation framework — contracts only.
 *
 * Today exactly one policy exists (`UniformRandomPolicy`, the shuffle the
 * game has always had). These interfaces are the seams future policies plug
 * into without touching gameplay or telemetry. See
 * docs/architecture/recommendation.md for how each piece is meant to evolve.
 *
 * The flow of one draw:
 *
 *   ContextSnapshot ─┐
 *   SessionState ────┼─► CandidateGenerator ─► Candidate[]
 *                    │                            │
 *                    │     ConversationArc ───────┤ (phase for this position)
 *                    │                            ▼
 *                    └────────────────────► QuestionRanker ─► RankedCandidate[]
 *                                                  │
 *                                                  ▼
 *                                   RecommendationPolicy.select ─► Selection
 *
 * Invariants every policy must keep (docs/adr/0003-recommendation-framework.md):
 *
 * 1. **Selection probability is exact and logged.** A policy returns the
 *    probability with which it chose the candidate it chose. Deterministic
 *    policies return 1. This is what lets any future policy be evaluated
 *    against logs produced by any past one.
 * 2. **Hard constraints are applied by the CandidateGenerator, never
 *    learned.** Consent gates, disabled packs and (later) the group's spice
 *    ceiling decide *eligibility*. A ranker only orders what is already
 *    eligible, so no amount of optimisation can reach past a gate.
 * 3. **Policies are pure given their inputs and `random`.** No I/O, no
 *    clock, no globals. Same inputs + same random stream = same selection.
 * 4. **Scores are ephemeral.** A ranker's scores exist for one draw. They are
 *    never persisted as a property of a question — there is no global
 *    question score (docs/strategy.md, principle 3).
 */

import type { Category, Kind, Source } from '../questions'

/* ------------------------------------------------------------ context --- */

/** Why a context snapshot was taken. Extend by adding values; never re-mean one. */
export type ContextReason = 'session_start' | 'pool_changed' | 'context_changed'

/** Relationship of the people at the table. `null` everywhere means "not known". */
export type Relationship = 'strangers' | 'acquaintances' | 'friends' | 'family' | 'partners' | 'coworkers' | 'mixed'

/**
 * Everything known about the room at a moment in time.
 *
 * Immutable: a change produces a new snapshot. Impressions reference the
 * snapshot that was current when their card was selected.
 *
 * Today only `pool` is populated — which packs are on and which gated packs
 * this table agreed to. The group dimensions exist so the telemetry schema
 * never has to change when a UI to set them arrives; they are `null` until
 * then, and `null` always means *unknown*, never a default.
 */
export type ContextSnapshot = {
  readonly schemaVersion: 1
  readonly snapshotId: string
  readonly sessionId: string
  /** Monotonic within a session, starting at 0. */
  readonly seq: number
  readonly capturedAt: string
  readonly reason: ContextReason
  readonly pool: {
    readonly baseEnabled: boolean
    readonly enabledCategories: readonly Category[]
    readonly consentedCategories: readonly Category[]
    readonly size: number
  }
  readonly group: {
    readonly size: number | null
    readonly relationship: Relationship | null
  }
  readonly ceilings: {
    /** Highest spice value key allowed (see catalog/tags.ts), or null for no ceiling set. */
    readonly spice: string | null
  }
  /**
   * Room for dimensions nobody has thought of yet. Keys are snake_case,
   * values scalar. A dimension that proves itself gets promoted to a typed
   * field (and a column) by a migration; until then it lives here.
   */
  readonly dimensions: Readonly<Record<string, string | number | boolean | null>>
}

/* ----------------------------------------------------------- candidates --- */

/** One question that could be dealt next. */
export type Candidate = {
  /** Index into `questions` for this build. Never persisted — ids are. */
  readonly index: number
  readonly questionId: string
  readonly revisionId: string
  readonly category: Category | null
  readonly source: Source
  readonly kind: Kind
}

/** What has happened so far this session, as a policy may see it. */
export type SessionState = {
  /** Indices dealt this session, in order (the deck's history). */
  readonly history: readonly number[]
  /** Index on screen right now, or null before the first card. */
  readonly current: number | null
  /**
   * Indices not yet dealt in the current pass through the pool. The shuffle's
   * "see everything before repeats" guarantee lives here; future policies may
   * ignore it.
   */
  readonly remaining: readonly number[]
  /** 1-based position the next card will occupy. */
  readonly nextPosition: number
}

export type CandidateRequest = {
  readonly pool: readonly number[]
  readonly state: SessionState
  readonly context: ContextSnapshot | null
}

export type CandidateSet = {
  readonly candidates: readonly Candidate[]
  /**
   * The pass state to carry forward once one of these is chosen, minus the
   * chosen one. Generators that don't track passes return `null`.
   */
  readonly remainingAfterRefill: readonly number[] | null
  /** Identifies the generator for telemetry and debugging. */
  readonly generatorId: string
}

/**
 * Produces the eligible set for one draw. This is where hard constraints
 * live (principle 2 above).
 */
export interface CandidateGenerator {
  readonly id: string
  generate(request: CandidateRequest): CandidateSet
}

/* -------------------------------------------------------------- ranking --- */

export type RankedCandidate = {
  readonly candidate: Candidate
  /** Ephemeral, policy-internal, never persisted. Higher is better. */
  readonly score: number
}

/**
 * Orders eligible candidates. A ranker never removes a candidate for a
 * safety reason — that is the generator's job — and never sees one the
 * generator excluded.
 */
export interface QuestionRanker {
  readonly id: string
  readonly version: string
  rank(candidates: readonly Candidate[], context: ContextSnapshot | null, state: SessionState, arc: ArcPosition | null): readonly RankedCandidate[]
}

/* ------------------------------------------------------------------ arc --- */

/**
 * A named stretch of a conversation — e.g. "warm-up", "opening up", "deep",
 * "come back up". What phases exist, and what they prefer, is an editorial
 * decision expressed in terms of tags.
 */
export type ArcPhase = {
  readonly key: string
  readonly label: string
  /** Tag preferences, as dimension → acceptable value keys. Empty means no preference. */
  readonly prefers: Readonly<Record<string, readonly string[]>>
}

export type ArcPosition = {
  readonly arcId: string
  readonly arcVersion: string
  readonly phase: ArcPhase
  /** 0..1 progress through the phase, if the arc can say. */
  readonly progress: number | null
}

/**
 * The shape a session should take over time. The unit a future engine
 * recommends is the arc, not the card (docs/strategy.md, principle 2).
 */
export interface ConversationArc {
  readonly id: string
  readonly version: string
  readonly phases: readonly ArcPhase[]
  /** Where in the arc the next card falls, given what has happened. */
  position(state: SessionState, context: ContextSnapshot | null): ArcPosition
}

/* --------------------------------------------------------------- policy --- */

export type SelectionRequest = {
  readonly pool: readonly number[]
  readonly state: SessionState
  readonly context: ContextSnapshot | null
  /** Uniform [0, 1). Injected so a draw is reproducible in tests and replays. */
  readonly random: () => number
}

/** Everything telemetry needs to know about how a card was chosen. */
export type Selection = {
  readonly candidate: Candidate
  /** Exact probability this policy assigned to the chosen candidate. (0, 1]. */
  readonly probability: number
  readonly candidateCount: number
  readonly policyId: string
  readonly policyVersion: string
  readonly arcPhase: string | null
  /** The pass state after this draw (see SessionState.remaining). */
  readonly remaining: readonly number[]
}

export interface RecommendationPolicy {
  readonly id: string
  readonly version: string
  /** Returns null only when nothing is eligible (an empty pool). */
  select(request: SelectionRequest): Selection | null
}

/* ----------------------------------------------------------- evaluation --- */

/**
 * One logged decision, in the shape offline evaluation consumes. Built from
 * the `research_impressions` view — see docs/telemetry-spec.md.
 */
export type LoggedDecision = {
  readonly impressionId: string
  readonly sessionId: string
  readonly context: ContextSnapshot | null
  readonly state: SessionState
  readonly chosen: Candidate
  readonly loggingPolicyId: string
  readonly loggingPolicyVersion: string
  /** The logging policy's probability for `chosen`. */
  readonly loggingProbability: number
}

/**
 * An outcome attached to a decision. Deliberately raw — which outcome counts
 * as "a good conversation" is the evaluator's choice, made explicitly and
 * recorded with the result, never baked into the logs.
 */
export type LoggedOutcome = {
  readonly impressionId: string
  readonly exitAction: string | null
  readonly visibleMs: number | null
  readonly nominated: boolean
  readonly thumb: 'up' | 'down' | null
}

export type EvaluationResult = {
  readonly candidatePolicyId: string
  readonly candidatePolicyVersion: string
  readonly baselinePolicyId: string
  readonly outcomeDefinition: string
  readonly estimator: string
  readonly estimate: number
  readonly baselineEstimate: number
  readonly confidenceInterval: readonly [number, number] | null
  readonly decisions: number
  readonly notes: readonly string[]
}

/**
 * Compares a candidate policy against logged behaviour — in particular
 * against the permanent uniform-random baseline (principle 6). Estimators
 * (inverse propensity scoring, doubly robust, replay) implement this. None
 * exists yet.
 */
export interface PolicyEvaluation {
  readonly estimator: string
  evaluate(
    candidate: RecommendationPolicy,
    decisions: readonly LoggedDecision[],
    outcomes: ReadonlyMap<string, LoggedOutcome>,
    outcomeDefinition: string,
  ): EvaluationResult
}
