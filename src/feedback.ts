/**
 * Ratings and suggestions — the app's only outbound data. Both are one-way:
 * this module can insert a row, and nothing in the app (or the database
 * policies backing it) ever reads one back. Submitted questions never enter
 * `questions.ts`; that stays a manual, editorial step.
 *
 * The Supabase SDK is loaded lazily (dynamic `import()`), only on the first
 * actual rating or suggestion attempt — not on initial page load. With real
 * credentials configured, `createClient(...)` becomes reachable code, so
 * esbuild can no longer tree-shake the SDK out of the main bundle; deferring
 * the import keeps that ~60KB gzipped off everyone's first paint, including
 * the (likely common) case of a visitor who never taps a rating at all.
 *
 * Needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time (see
 * README). Without them, every function below is a safe no-op — the rating
 * and suggestion UI still work, they just don't persist, and a warning is
 * logged once, on that first attempt, so that's obvious in development.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Category, Source } from './questions'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let clientPromise: Promise<SupabaseClient | null> | undefined

/** Fetches and builds the client at most once; every caller shares the result. */
function getClient(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise =
      SUPABASE_URL && SUPABASE_ANON_KEY
        ? import('@supabase/supabase-js').then(({ createClient }) =>
            createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
          )
        : Promise.resolve(null)

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn(
        'Question Bowl: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — ratings and suggestions will not be saved.',
      )
    }
  }
  return clientPromise
}

export type RatingValue = 'up' | 'down'

/** One thumbs-up or thumbs-down on a question. Fire-and-forget; never blocks the UI. */
export async function submitRating(
  text: string,
  category: Category | null,
  source: Source,
  value: RatingValue,
): Promise<boolean> {
  const client = await getClient()
  if (!client) return false
  const { error } = await client.from('question_ratings').insert({
    question_text: text,
    category,
    source,
    value,
  })
  if (error) {
    console.warn('Question Bowl: rating failed to save', error.message)
    return false
  }
  return true
}

/** A user-submitted question idea, for manual editorial review — never auto-added to the deck. */
export async function submitSuggestion(text: string, category: Category | null): Promise<boolean> {
  const client = await getClient()
  if (!client) return false
  const { error } = await client.from('question_suggestions').insert({
    suggested_text: text,
    suggested_category: category,
  })
  if (error) {
    console.warn('Question Bowl: suggestion failed to save', error.message)
    return false
  }
  return true
}

/* -------------------------------------------------------- rated-locally --- */

const RATINGS_KEY = 'qb.ratings.v1'

/**
 * Question text → the rating already given it on this device. App.tsx keeps
 * its own copy of this map in React state (loaded once via `loadRatings`,
 * kept in sync via `saveRatings` on every change) so the rate buttons update
 * immediately — reading localStorage directly wouldn't trigger a re-render.
 */
export function loadRatings(): Record<string, RatingValue> {
  try {
    const raw = localStorage.getItem(RATINGS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, RatingValue>) : {}
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
