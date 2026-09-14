/**
 * Manual tags, keyed by permanent question id.
 *
 * **Every entry here is written by a person.** Not generated, not suggested
 * by a model, not inferred from ratings. See `tags.ts` for the scheme and
 * docs/implementation.md → "Tagging questions" for the editorial workflow.
 *
 * Tags describe a question's *current* wording. When a question is reworded
 * (a new revision), revisit its tags in the same change — the catalog sync
 * records tags against the revision they were current for, so history stays
 * honest either way.
 *
 * Empty on purpose at launch: an untagged question is "not yet described",
 * and no policy exists yet that reads tags. `npm test` validates every entry
 * against the scheme and rejects ids that don't exist.
 *
 * Example:
 *
 *   'base-001': {
 *     depth: 'light',
 *     spice: 'mild',
 *     energy: 'lively',
 *     format: 'preference',
 *     familiarity_required: 'strangers',
 *     group_size_fit: ['pair', 'small', 'large'],
 *     risk: 'low',
 *   },
 */
import type { QuestionTags } from './tags'

export const QUESTION_TAGS: Readonly<Record<string, QuestionTags>> = {}
