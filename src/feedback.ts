/**
 * Ratings and suggestions — the app's outbound feedback. Both are one-way:
 * this module can insert a row, and nothing in the app (or the database
 * policies backing it) ever reads one back. Submitted questions never enter
 * `questions.ts`; that stays a manual, editorial step.
 *
 * Every row now carries `attribution()` — the device's visitor id, this
 * page load's session id, and the test-mode flag — so a rating can be tied
 * to the session that produced it, and so an admin trying the app out
 * doesn't land in the beta's real numbers. See analytics.ts.
 *
 * Both writes go through `restInsert` — a bare POST at PostgREST, not the
 * Supabase SDK. These are insert-only rows against insert-only tables, so
 * the SDK would buy nothing and cost ~60KB gzipped in the main bundle; see
 * supabase.ts. Without credentials both functions are safe no-ops: the
 * rating and suggestion UI still work, they just don't persist.
 */
import { attribution } from './analytics'
import { ALL_BY_ID, type Category, type Source } from './questions'
import { restInsert } from './supabase'

export type RatingValue = 'up' | 'down'

/** One thumbs-up or thumbs-down on a question. Fire-and-forget; never blocks the UI. */
export async function submitRating(
  id: string,
  text: string,
  category: Category | null,
  source: Source,
  value: RatingValue,
): Promise<boolean> {
  const ok = await restInsert('question_ratings', {
    question_id: id,
    question_text: text,
    category,
    source,
    value,
    ...attribution(),
  })
  if (!ok) console.warn('Sip the Tea: rating failed to save')
  return ok
}

/** A user-submitted question idea, for manual editorial review — never auto-added to the deck. */
export async function submitSuggestion(text: string, category: Category | null): Promise<boolean> {
  const ok = await restInsert('question_suggestions', {
    suggested_text: text,
    suggested_category: category,
    ...attribution(),
  })
  if (!ok) console.warn('Sip the Tea: suggestion failed to save')
  return ok
}

/* -------------------------------------------------------- rated-locally --- */

const RATINGS_KEY = 'qb.ratings.v2'
const RATINGS_KEY_V1 = 'qb.ratings.v1'

/**
 * Question **id** → the rating already given it on this device. App.tsx keeps
 * its own copy of this map in React state (loaded once via `loadRatings`,
 * kept in sync via `saveRatings` on every change) so the rate buttons update
 * immediately — reading localStorage directly wouldn't trigger a re-render.
 *
 * v1 keyed on question text, which meant a reworded question came back up
 * for anyone who had already rated it. v2 keys on the id, so it doesn't.
 */
export function loadRatings(): Record<string, RatingValue> {
  try {
    const raw = localStorage.getItem(RATINGS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, RatingValue>

    // First load since the switch: carry v1's marks over by matching text to
    // id. Anything whose wording has since changed simply won't match, and
    // that question becomes rateable again — a rating this device already
    // sent is safely in the database either way, so the cost is one possible
    // duplicate vote, not lost history.
    const legacy = localStorage.getItem(RATINGS_KEY_V1)
    if (!legacy) return {}
    const byText = new Map<string, string>()
    for (const [id, q] of ALL_BY_ID) byText.set(q.text, id)
    const migrated: Record<string, RatingValue> = {}
    for (const [text, value] of Object.entries(
      JSON.parse(legacy) as Record<string, RatingValue>,
    )) {
      const id = byText.get(text)
      if (id) migrated[id] = value
    }
    saveRatings(migrated)
    return migrated
  } catch {
    return {}
  }
}

export function saveRatings(ratings: Record<string, RatingValue>): void {
  try {
    localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings))
  } catch {
    // Storage unavailable (private mode, quota, etc.) — the rating still
    // submits to Supabase; it just won't be remembered as "already rated"
    // here on reload, so it could in principle be rated again later.
  }
}
