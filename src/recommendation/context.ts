/**
 * Building `ContextSnapshot`s from what the app knows about the room.
 *
 * Pure: the caller supplies ids and timestamps, so snapshots are testable
 * and a snapshot never quietly reads a global.
 */
import type { Category } from '../questions'
import type { ContextReason, ContextSnapshot, Relationship } from './types'

export type ContextInput = {
  snapshotId: string
  sessionId: string
  seq: number
  capturedAt: string
  reason: ContextReason
  baseEnabled: boolean
  enabledCategories: Iterable<Category>
  consentedCategories: Iterable<Category>
  poolSize: number
  groupSize?: number | null
  relationship?: Relationship | null
  spiceCeiling?: string | null
  dimensions?: Record<string, string | number | boolean | null>
}

export function buildContextSnapshot(input: ContextInput): ContextSnapshot {
  return {
    schemaVersion: 1,
    snapshotId: input.snapshotId,
    sessionId: input.sessionId,
    seq: input.seq,
    capturedAt: input.capturedAt,
    reason: input.reason,
    pool: {
      baseEnabled: input.baseEnabled,
      // Sorted so two snapshots of the same state compare equal.
      enabledCategories: [...input.enabledCategories].sort(),
      consentedCategories: [...input.consentedCategories].sort(),
      size: input.poolSize,
    },
    group: {
      size: input.groupSize ?? null,
      relationship: input.relationship ?? null,
    },
    ceilings: { spice: input.spiceCeiling ?? null },
    dimensions: { ...(input.dimensions ?? {}) },
  }
}

/** Whether two snapshots describe the same room (ignoring ids, time and reason). */
export function sameContext(a: ContextSnapshot, b: ContextSnapshot): boolean {
  const strip = (s: ContextSnapshot) =>
    JSON.stringify({ pool: s.pool, group: s.group, ceilings: s.ceilings, dimensions: s.dimensions })
  return strip(a) === strip(b)
}
