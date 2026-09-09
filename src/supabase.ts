/**
 * Two ways to reach Supabase, deliberately unequal.
 *
 * `restInsert` is a bare `fetch` at PostgREST. Every write the deck makes —
 * ratings, suggestions, analytics events — is one insert-only POST against a
 * table whose RLS grants anon `insert` and nothing else. That needs a URL, a
 * key and a JSON body; it does not need a query builder, an auth stack, a
 * realtime socket or a storage client. So the player side of the app doesn't
 * load them, and the Supabase SDK never enters the main bundle at all.
 *
 * That matters more than it looks. An earlier pass made the SDK a dynamic
 * import to keep ~60KB gzipped off first paint, on the reasoning that most
 * visitors never rate anything. Analytics broke that reasoning: `app_opened`
 * fires on mount for everyone, so the "only if you interact" import would
 * have become "always, immediately", and the whole saving would have
 * evaporated. Dropping to `fetch` for writes is what keeps the promise
 * rather than re-litigating it.
 *
 * `getClient` is the real SDK, still lazily imported, and now used by
 * exactly one caller: the admin dashboard, which genuinely needs auth. It
 * ships in the /admin chunk and nowhere near a player.
 *
 * Both need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time
 * (see README). Without them everything here is a safe no-op — the rating
 * and suggestion UI still work, they just don't persist — and one warning is
 * logged on the first attempt so it's obvious in development.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Whether credentials exist at all. */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let warned = false
function warnOnce(): void {
  if (warned) return
  warned = true
  console.warn(
    'Question Bowl: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — ratings, suggestions and analytics will not be saved.',
  )
}

/**
 * Insert one row. Resolves `true` on success and `false` on anything else —
 * no credentials, offline, blocked by an extension, rejected by RLS. Never
 * throws, so a caller can ignore the result entirely.
 */
export async function restInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    warnOnce()
    return false
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        // Nothing here ever reads a row back, and RLS wouldn't allow it
        // anyway — ask for no representation rather than a 401 on the echo.
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    })
    return res.ok
  } catch {
    return false
  }
}

/* ------------------------------------------------------------- the SDK --- */

let clientPromise: Promise<SupabaseClient | null> | undefined

/**
 * The full SDK, built at most once. Admin dashboard only — it's the one
 * caller that needs sign-in, sessions and RPC. Importing this from anywhere
 * on the player path puts ~60KB back into first paint.
 */
export function getClient(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise =
      SUPABASE_URL && SUPABASE_ANON_KEY
        ? import('@supabase/supabase-js').then(({ createClient }) =>
            createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
          )
        : Promise.resolve(null)
    if (!supabaseConfigured) warnOnce()
  }
  return clientPromise
}
