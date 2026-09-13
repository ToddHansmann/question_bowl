/**
 * The question tag scheme — how a question is *described*, so that a future
 * policy can reason about "a light, low-risk warm-up for strangers" rather
 * than about individual question ids.
 *
 * Tags are assigned by a person. Never generated, never inferred from
 * wording, never learned from play data. A learned signal about how a
 * question performs belongs in telemetry and is computed at query time; a tag
 * is an editor's description of what the question *is*. Keeping the two
 * apart is what lets either change without contaminating the other.
 *
 * Scheme evolution rules (see docs/adr/0005-question-tag-scheme.md):
 * - A dimension is never renamed and a value is never re-meant. Add a new
 *   dimension or value instead, and bump `TAG_SCHEME_VERSION`.
 * - Ordinal dimensions store their value's *key* ('light'), never its rank,
 *   so a scale can gain a step without rewriting history.
 * - Removing a value means deprecating it here (`deprecated: true`); tagged
 *   history keeps it.
 */

export const TAG_SCHEME_VERSION = 1

type ValueDef = { key: string; label: string; deprecated?: boolean }

type DimensionDef = {
  key: string
  label: string
  description: string
  /** `ordinal` — one value, ordered low → high. `enum` — one value. `set` — one or more values. */
  kind: 'ordinal' | 'enum' | 'set'
  values: readonly ValueDef[]
}

export const TAG_DIMENSIONS = [
  {
    key: 'depth',
    label: 'Depth',
    description: 'How much of themselves the question asks someone to reveal.',
    kind: 'ordinal',
    values: [
      { key: 'surface', label: 'Surface — anyone could answer' },
      { key: 'light', label: 'Light — a bit about you' },
      { key: 'personal', label: 'Personal — real opinions and stories' },
      { key: 'vulnerable', label: 'Vulnerable — fears, regrets, private things' },
      { key: 'deep', label: 'Deep — identity, meaning, the big stuff' },
    ],
  },
  {
    key: 'spice',
    label: 'Spice',
    description: 'How racy or provocative it is. The group’s ceiling will be set against this.',
    kind: 'ordinal',
    values: [
      { key: 'mild', label: 'Mild' },
      { key: 'cheeky', label: 'Cheeky' },
      { key: 'spicy', label: 'Spicy' },
      { key: 'explicit', label: 'Explicit' },
    ],
  },
  {
    key: 'energy',
    label: 'Energy',
    description: 'What it does to the room.',
    kind: 'ordinal',
    values: [
      { key: 'calm', label: 'Calm — reflective' },
      { key: 'lively', label: 'Lively — chatty' },
      { key: 'high', label: 'High — loud, laughing, moving' },
    ],
  },
  {
    key: 'format',
    label: 'Format',
    description: 'The shape of the answer it invites.',
    kind: 'enum',
    values: [
      { key: 'story', label: 'Story — tell us about a time' },
      { key: 'opinion', label: 'Opinion — what do you think' },
      { key: 'preference', label: 'Preference — this or that, favourites' },
      { key: 'hypothetical', label: 'Hypothetical — what would you do' },
      { key: 'confession', label: 'Confession — have you ever' },
      { key: 'group', label: 'Group — about the people in the room' },
      { key: 'dare', label: 'Dare — do something' },
    ],
  },
  {
    key: 'familiarity_required',
    label: 'Familiarity required',
    description: 'How well the group needs to know each other for it to land.',
    kind: 'ordinal',
    values: [
      { key: 'strangers', label: 'Works with strangers' },
      { key: 'acquaintances', label: 'Needs some shared context' },
      { key: 'close', label: 'Close friends or partners' },
    ],
  },
  {
    key: 'group_size_fit',
    label: 'Group size fit',
    description: 'Group sizes it works well for. Choose every one that applies.',
    kind: 'set',
    values: [
      { key: 'pair', label: 'Two people' },
      { key: 'small', label: 'Small group (3–6)' },
      { key: 'large', label: 'Large group (7+)' },
    ],
  },
  {
    key: 'risk',
    label: 'Risk',
    description: 'Chance it hurts someone, embarrasses them against their will, or sours the room.',
    kind: 'ordinal',
    values: [
      { key: 'low', label: 'Low' },
      { key: 'medium', label: 'Medium' },
      { key: 'high', label: 'High' },
    ],
  },
] as const satisfies readonly DimensionDef[]

export type TagDimension = (typeof TAG_DIMENSIONS)[number]
export type TagDimensionKey = TagDimension['key']
type ValueKeyOf<K extends TagDimensionKey> = Extract<TagDimension, { key: K }>['values'][number]['key']

/**
 * A question's tags. Every dimension is optional: an untagged dimension is
 * "not yet described", which a policy must treat as unknown — never as the
 * lowest value.
 */
export type QuestionTags = {
  depth?: ValueKeyOf<'depth'>
  spice?: ValueKeyOf<'spice'>
  energy?: ValueKeyOf<'energy'>
  format?: ValueKeyOf<'format'>
  familiarity_required?: ValueKeyOf<'familiarity_required'>
  group_size_fit?: readonly ValueKeyOf<'group_size_fit'>[]
  risk?: ValueKeyOf<'risk'>
}

export function dimension(key: string): DimensionDef | undefined {
  return (TAG_DIMENSIONS as readonly DimensionDef[]).find((d) => d.key === key)
}

/** Ordinal rank of a value within its dimension, or null if it isn't ordinal or unknown. */
export function ordinalRank(key: TagDimensionKey, value: string): number | null {
  const d = dimension(key)
  if (!d || d.kind !== 'ordinal') return null
  const i = d.values.findIndex((v) => v.key === value)
  return i === -1 ? null : i
}

/** Every problem with a tag record, as human-readable strings. Empty means valid. */
export function validateTags(tags: Record<string, unknown>): string[] {
  const problems: string[] = []
  for (const [key, value] of Object.entries(tags)) {
    const d = dimension(key)
    if (!d) {
      problems.push(`unknown dimension "${key}"`)
      continue
    }
    const allowed = new Set(d.values.map((v) => v.key))
    if (d.kind === 'set') {
      if (!Array.isArray(value) || value.length === 0) {
        problems.push(`${key} must be a non-empty list`)
        continue
      }
      if (new Set(value).size !== value.length) problems.push(`${key} repeats a value`)
      for (const v of value) if (!allowed.has(v as string)) problems.push(`${key} has unknown value "${String(v)}"`)
    } else if (typeof value !== 'string' || !allowed.has(value)) {
      problems.push(`${key} has unknown value "${String(value)}"`)
    }
  }
  return problems
}

/** How many of the scheme's dimensions a tag record fills in. */
export function tagCoverage(tags: QuestionTags | undefined): number {
  if (!tags) return 0
  return TAG_DIMENSIONS.filter((d) => tags[d.key as keyof QuestionTags] !== undefined).length
}
