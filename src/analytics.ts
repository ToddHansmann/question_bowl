/**
 * Analytics — who showed up, and how far they got.
 *
 * Everything lands in one append-only table, `analytics_events`, as a
 * `{ name, props }` pair. That shape is the point: a new metric is a new
 * event name or a new key in `props`, never a new column and never a
 * migration. The dashboard's SQL reads names it knows and ignores the rest,
 * so recording something before anyone reports on it is free.
 *
 * What's collected is deliberately thin — a random visitor id, a random
 * session id, an event name, and how many questions were seen. No accounts,
 * no PII, no fingerprinting, no third party. `visitorId` is a UUID generated
 * on this device and kept in localStorage; it says "the same browser came
 * back", and nothing else. Clearing site data makes someone a new visitor,
 * which is the correct trade for not identifying anyone.
 *
 * Every write is fire-and-forget and swallows its own failures: analytics
 * must never be able to break, block, or slow down the deck.
 */
import { restInsert } from './supabase'

const VISITOR_KEY = 'qb.visitor.v1'
const TEST_MODE_KEY = 'qb.testMode.v1'

/**
 * How many questions a session has to reach before it counts as "completed".
 *
 * There's no natural end to a Question Bowl session — the deck never runs
 * out — so completion has to be defined rather than observed. Five is the
 * point where someone has clearly played rather than glanced: past the first
 * question they were handed, past a second out of curiosity, and into a
 * rhythm. The dashboard states this next to the number so it can't be
 * mistaken for something the app measured on its own. Changing it changes
 * only what future sessions report; history keeps whatever it was recorded
 * under.
 */
export const SESSION_COMPLETE_AT = 5

function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Very old browsers, or a non-secure context. Uniqueness is all that's
    // needed here, not unguessability.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
}

/** Stable per-device id. Survives reloads; a new one means a new visitor. */
function visitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY)
    if (existing) return existing
    const fresh = uuid()
    localStorage.setItem(VISITOR_KEY, fresh)
    return fresh
  } catch {
    // Private mode or storage disabled — this visitor is simply new every
    // time, which overstates unique visitors slightly rather than failing.
    return uuid()
  }
}

/** New on every page load. Not persisted anywhere. */
const sessionId = uuid()

/* ----------------------------------------------------------- test mode --- */

/**
 * Test mode marks everything this device sends as `is_test = true`, and the
 * dashboard hides test rows unless asked to include them. It's turned on
 * automatically whenever an admin signs in to the dashboard, and can be
 * toggled by hand from there — so Todd demoing the app on his own phone
 * doesn't quietly become the beta's engagement numbers.
 *
 * It lives in localStorage rather than being derived from the auth session
 * on each write, because the interesting case is exactly the one where the
 * admin is *playing* rather than looking at the dashboard.
 *
 * This is client-asserted, so a determined visitor could flag their own
 * activity as test and hide it. That costs them their own data and nobody
 * else's, which is not worth defending against here.
 */
export function isTestMode(): boolean {
  try {
    return localStorage.getItem(TEST_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setTestMode(on: boolean): void {
  try {
    localStorage.setItem(TEST_MODE_KEY, on ? 'true' : 'false')
  } catch {
    // Nothing to do; the flag just won't persist.
  }
}

/** The identity every outbound row carries, so ratings can join to sessions. */
export function attribution(): {
  visitor_id: string
  session_id: string
  is_test: boolean
} {
  return { visitor_id: visitorId(), session_id: sessionId, is_test: isTestMode() }
}

/* -------------------------------------------------------------- events --- */

/** Record one event. Never throws, never awaited by the UI. */
export function track(name: string, props: Record<string, unknown> = {}): void {
  // `restInsert` already swallows everything; the result is deliberately
  // ignored. An unrecorded event is not worth a broken deck, or even a
  // console warning on every swipe.
  void restInsert('analytics_events', { name, props, ...attribution() })
}

/**
 * The three traffic events, each fired at most once per session.
 *
 * `app_opened` is what unique visitors and sessions are counted from — it
 * fires for everyone who loads the page, including someone who never taps
 * past the landing screen. `session_started` is the tap into the deck, so
 * the gap between the two is the landing screen's drop-off. `session_
 * completed` is SESSION_COMPLETE_AT questions in.
 */
const fired = new Set<string>()

export function trackOnce(name: string, props: Record<string, unknown> = {}): void {
  if (fired.has(name)) return
  fired.add(name)
  track(name, props)
}
