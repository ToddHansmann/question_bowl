/**
 * The question lifecycle.
 *
 *     Draft → Experimental → Canon → Archived
 *
 * - **draft** — a community submission an editor has accepted for
 *   consideration. It has a permanent id (`com-0001`) from this moment on,
 *   but it lives only in the database and is never dealt.
 * - **experimental** — an editor has decided it is worth testing with real
 *   tables. It ships in `questions.ts` and is dealt only while the
 *   `experimentalQuestions` flag is on.
 * - **canon** — an editor has decided it belongs in the game. Dealt normally.
 * - **archived** — out of play, never deleted. Its id and every revision stay
 *   resolvable so historical data never orphans. (`retired` in `questions.ts`
 *   predates this vocabulary and means exactly this.)
 *
 * **Every transition is editorial. None is automatic.** Nothing in this
 * codebase — no threshold, no score, no job — may move a question between
 * states. The database enforces the same table of allowed moves
 * (`lifecycle_transitions`), and records every move as an append-only event
 * with a person's email and a reason.
 *
 * Draft can never jump straight to Canon: a community question has to be
 * played before it can be canon. Archived can return to Experimental (a
 * retest), never straight back to Canon, for the same reason.
 */

export const LIFECYCLE_STATUSES = ['draft', 'experimental', 'canon', 'archived'] as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

/** `from → allowed destinations`. Mirrored row-for-row by the `lifecycle_transitions` table. */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecycleStatus, readonly LifecycleStatus[]>> = {
  draft: ['experimental', 'archived'],
  experimental: ['canon', 'archived'],
  canon: ['archived'],
  archived: ['experimental'],
}

export function canTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to)
}

/** Statuses a question can have while it ships in `questions.ts`. Drafts never ship. */
export type ShippedStatus = Exclude<LifecycleStatus, 'draft'>

/** Whether a status is ever dealt, given whether experimental questions are switched on. */
export function isDealt(status: LifecycleStatus, experimentalEnabled: boolean): boolean {
  if (status === 'canon') return true
  if (status === 'experimental') return experimentalEnabled
  return false
}
