/**
 * The admin dashboard, served at /admin.
 *
 * Security is entirely server-side and this file holds no part of it. Sign-in
 * is Supabase Auth; every number on the page comes from a SECURITY DEFINER
 * function that calls `is_admin()` before it aggregates anything, and the
 * underlying tables grant SELECT only to signed-in users whose email is in
 * `admin_emails`. There is no password, key, or allow-list in this bundle —
 * a visitor who reads the JavaScript, or calls the RPCs by hand with the
 * anon key, gets `permission denied for function`. The UI below is a view
 * over data the caller was already allowed to read, never the thing deciding
 * whether they may.
 *
 * Loaded as its own lazy chunk (see main.tsx), so none of it — nor the auth
 * half of the Supabase SDK — reaches someone who just came to play.
 */
import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isDeviceExcluded, isTestMode, setDeviceExcluded, setTestMode } from './analytics'
import { BASE_DECK, PACKS, baseQuestions, expansionQuestions } from './questions'
import { getClient, supabaseConfigured } from './supabase'
import { CatalogPanel, CommunityQuestions, DataHealth, type DeckSummary } from './admin/Foundation'
import './admin.css'

/* ------------------------------------------------------- deck counts --- */

/*
 * Purely local — every number here comes from `questions.ts`, already in the
 * bundle, so this needs no query and no RPC. "How many questions are in each
 * pack" is a fact about the deck, not about who played, and the deck never
 * changes at runtime.
 */
const QUESTION_PACKS = PACKS.filter((p) => p.group === 'expansion')
const CHALLENGE_PACKS = PACKS.filter((p) => p.group === 'challenge')
const RETIRED_BASE_COUNT = BASE_DECK.length - baseQuestions.length

const ACTIVE_COUNT_BY_CATEGORY: ReadonlyMap<string, number> = (() => {
  const counts = new Map<string, number>()
  for (const q of expansionQuestions) {
    if (q.retired) continue
    counts.set(q.category, (counts.get(q.category) ?? 0) + 1)
  }
  return counts
})()

const totalFor = (packs: typeof PACKS): number =>
  packs.reduce((sum, p) => sum + (ACTIVE_COUNT_BY_CATEGORY.get(p.category) ?? 0), 0)

const TOTAL_QUESTION_PACK_COUNT = totalFor(QUESTION_PACKS)
const TOTAL_CHALLENGE_COUNT = totalFor(CHALLENGE_PACKS)

/** Handed to `CatalogPanel`, which combines this with what the database has registered (see Foundation.tsx). */
const DECK_SUMMARY: DeckSummary = {
  baseCount: baseQuestions.length,
  retiredBaseCount: RETIRED_BASE_COUNT,
  questionPacks: QUESTION_PACKS,
  challengePacks: CHALLENGE_PACKS,
  activeCountByCategory: ACTIVE_COUNT_BY_CATEGORY,
  totalQuestionPackCount: TOTAL_QUESTION_PACK_COUNT,
  totalChallengeCount: TOTAL_CHALLENGE_COUNT,
}

/* ------------------------------------------------------------- shapes --- */

type Traffic = {
  unique_visitors: number
  sessions_opened: number
  sessions_started: number
  sessions_completed: number
}

type Engagement = {
  total_ratings: number
  thumbs_up: number
  thumbs_down: number
  positive_pct: number | null
  total_suggestions: number
}

type CategoryRow = {
  category: string
  thumbs_up: number
  thumbs_down: number
  total: number
  positive_pct: number
}

type QuestionRow = CategoryRow & {
  /** Stable id. The row's identity, and its React key — the text can change. */
  question_id: string
  /** Most recent wording recorded for that id, so rewrites show current text. */
  question_text: string
  source: string
  polarization: number
  last_rated_at: string
}

type Suggestion = {
  id: string
  text: string
  category: string | null
  is_test: boolean
  created_at: string
}

type Metrics = {
  traffic: Traffic | null
  engagement: Engagement | null
  byCategory: CategoryRow[]
  byQuestion: QuestionRow[]
  suggestions: Suggestion[]
}

const EMPTY: Metrics = {
  traffic: null,
  engagement: null,
  byCategory: [],
  byQuestion: [],
  suggestions: [],
}

type DailyMetrics = {
  traffic: Traffic | null
  engagement: Engagement | null
}

const EMPTY_DAILY: DailyMetrics = { traffic: null, engagement: null }

/* ------------------------------------------------------------ helpers --- */

const n = (v: unknown): number => Number(v ?? 0)

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`
}

function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Percent of sessions that got past the landing screen, and past five questions. */
function rate(part: number, whole: number): string {
  if (!whole) return '—'
  return `${((100 * part) / whole).toFixed(0)}%`
}

/* ---------------------------------------------------------------- app --- */

export default function Admin() {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [booting, setBooting] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  const [includeTest, setIncludeTest] = useState(false)
  const [minVotes, setMinVotes] = useState(1)
  const [deviceExcluded, setDeviceExcludedState] = useState(() => isDeviceExcluded())
  // Tracked only to display it — see the effect below that keeps it current.
  const [deviceTestMode, setDeviceTestModeState] = useState(() => isTestMode())

  const [metrics, setMetrics] = useState<Metrics>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Traffic and Engagement can be scoped to "today" as well as all time.
  // Everything else on the page (ratings by category/question, suggestions)
  // stays all-time regardless — a single day rarely has enough ratings per
  // question for "most liked today" to mean anything, and the point of that
  // data is the long-run signal, not a daily number.
  const [range, setRange] = useState<'total' | 'daily'>('total')
  const [daily, setDaily] = useState<DailyMetrics>(EMPTY_DAILY)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyError, setDailyError] = useState<string | null>(null)

  // Restore an existing session on load, and follow sign-in/out after that.
  useEffect(() => {
    let live = true
    void (async () => {
      const c = await getClient()
      if (!live) return
      setClient(c)
      if (!c) {
        setBooting(false)
        return
      }
      const { data } = await c.auth.getSession()
      if (!live) return
      setUser(data.session?.user ?? null)
      setBooting(false)
      c.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
      })
    })()
    return () => {
      live = false
    }
  }, [])

  /**
   * Signing in to the dashboard turns test mode on for this device — still
   * true, just not a toggle in the UI anymore: the whole point of the flag
   * is the case where the admin is playing rather than reading numbers, and
   * that's a decision best made once, here, rather than remembered before
   * every demo. `isTestMode`/`setTestMode` stay as the underlying mechanism
   * ("Include test data" still reads it, `?qbtest=` still sets it); only the
   * manual on/off switch for it is gone, in favor of the one control that
   * actually matters day to day — Exclude this device from analytics.
   */
  useEffect(() => {
    if (user && !isTestMode()) {
      setTestMode(true)
    }
    if (user) setDeviceTestModeState(isTestMode())
  }, [user])

  const load = useCallback(async () => {
    if (!client || !user) return
    setLoading(true)
    setLoadError(null)
    const args = { include_test: includeTest }
    const [traffic, engagement, byCategory, byQuestion, suggestions] = await Promise.all([
      client.rpc('admin_traffic', args),
      client.rpc('admin_engagement', args),
      client.rpc('admin_ratings_by_category', args),
      client.rpc('admin_ratings_by_question', args),
      client.rpc('admin_suggestions', args),
    ])
    const failed = [traffic, engagement, byCategory, byQuestion, suggestions].find((r) => r.error)
    if (failed?.error) {
      // The RPCs return empty rather than erroring for a non-admin, so an
      // error here is a real fault (network, or the migration not applied).
      setLoadError(failed.error.message)
      setLoading(false)
      return
    }
    setMetrics({
      traffic: (traffic.data as Traffic[])?.[0] ?? null,
      engagement: (engagement.data as Engagement[])?.[0] ?? null,
      byCategory: (byCategory.data as CategoryRow[]) ?? [],
      byQuestion: (byQuestion.data as QuestionRow[]) ?? [],
      suggestions: (suggestions.data as Suggestion[]) ?? [],
    })
    setLoading(false)
  }, [client, user, includeTest])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * "Today" scoped from raw rows rather than an RPC. The admin RPCs are
   * all-time aggregates with no date parameter, and there's no migration
   * file in this repo to add one to — so rather than guess at a new
   * server-side function, this reads the same tables directly. RLS already
   * grants `select` on them to a signed-in admin (see the file header), which
   * is exactly the access this needs and nothing more.
   */
  const loadDaily = useCallback(async () => {
    if (!client || !user) return
    setDailyLoading(true)
    setDailyError(null)

    const since = new Date()
    since.setHours(0, 0, 0, 0)
    const sinceIso = since.toISOString()

    let events = client
      .from('analytics_events')
      .select('name, visitor_id')
      .gte('created_at', sinceIso)
    let ratings = client.from('question_ratings').select('value').gte('created_at', sinceIso)
    let suggestions = client
      .from('question_suggestions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso)
    if (!includeTest) {
      events = events.eq('is_test', false)
      ratings = ratings.eq('is_test', false)
      suggestions = suggestions.eq('is_test', false)
    }

    const [eventsRes, ratingsRes, suggestionsRes] = await Promise.all([events, ratings, suggestions])
    const failed = [eventsRes, ratingsRes, suggestionsRes].find((r) => r.error)
    if (failed?.error) {
      setDailyError(failed.error.message)
      setDailyLoading(false)
      return
    }

    const events_ = (eventsRes.data as { name: string; visitor_id: string | null }[]) ?? []
    const opened = events_.filter((r) => r.name === 'app_opened')
    const started = events_.filter((r) => r.name === 'session_started').length
    const completed = events_.filter((r) => r.name === 'session_completed').length
    const uniqueVisitors = new Set(opened.map((r) => r.visitor_id).filter(Boolean)).size

    const ratingRows = (ratingsRes.data as { value: string }[]) ?? []
    const up = ratingRows.filter((r) => r.value === 'up').length
    const down = ratingRows.filter((r) => r.value === 'down').length
    const total = up + down

    setDaily({
      traffic: {
        unique_visitors: uniqueVisitors,
        sessions_opened: opened.length,
        sessions_started: started,
        sessions_completed: completed,
      },
      engagement: {
        total_ratings: total,
        thumbs_up: up,
        thumbs_down: down,
        positive_pct: total ? (100 * up) / total : null,
        total_suggestions: suggestionsRes.count ?? 0,
      },
    })
    setDailyLoading(false)
  }, [client, user, includeTest])

  // Fetched lazily — only once "Today" is actually selected — rather than on
  // every load alongside the all-time numbers most visits never look at.
  useEffect(() => {
    if (range === 'daily') void loadDaily()
  }, [range, loadDaily])

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (!client || signingIn) return
    setSigningIn(true)
    setAuthError(null)
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setAuthError(error.message)
    setPassword('')
    setSigningIn(false)
  }

  async function signOut() {
    await client?.auth.signOut()
    setMetrics(EMPTY)
  }

  function toggleDeviceExcluded() {
    const next = !deviceExcluded
    setDeviceExcluded(next)
    setDeviceExcludedState(next)
  }

  /* ------------------------------------------------------------ views --- */

  if (!supabaseConfigured) {
    return (
      <Shell>
        <p className="adm-note">
          No Supabase credentials in this build — set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> and rebuild.
        </p>
      </Shell>
    )
  }

  if (booting) {
    return (
      <Shell>
        <p className="adm-note">Loading…</p>
      </Shell>
    )
  }

  if (!user) {
    return (
      <Shell>
        <form className="adm-signin" onSubmit={signIn}>
          <label className="adm-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="adm-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="adm-btn" disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
          {authError && <p className="adm-error">{authError}</p>}
        </form>
      </Shell>
    )
  }

  const t = metrics.traffic
  const e = metrics.engagement
  // An account that exists but isn't on the allow-list reads every metric as
  // zero, because the RPCs filter it out rather than refusing it. Say so,
  // instead of showing a dashboard of noughts that looks like no traffic.
  // Judged against the all-time numbers regardless of `range` — a quiet day
  // is a real, valid state for "Today" to be in and must never look like
  // "not an admin".
  const notAdmin =
    !loading &&
    !loadError &&
    t !== null &&
    n(t.unique_visitors) === 0 &&
    n(e?.total_ratings) === 0 &&
    n(e?.total_suggestions) === 0

  // What the Traffic/Engagement tiles actually render, per the switch.
  const shownTraffic = range === 'daily' ? daily.traffic : t
  const shownEngagement = range === 'daily' ? daily.engagement : e

  const rated = metrics.byQuestion.filter((q) => n(q.total) >= minVotes)
  // A "most/least liked" question must actually have a majority that way —
  // ranking by percentage alone could include a 40% question if nothing else
  // qualified, which isn't liked at all. Ties at exactly 50% belong to
  // neither list. No cap on either list: the card showing it reports the
  // real count, and expands to show every one of them.
  const mostLiked = [...rated]
    .filter((q) => n(q.positive_pct) > 50)
    .sort((a, b) => n(b.positive_pct) - n(a.positive_pct) || n(b.total) - n(a.total))
  const leastLiked = [...rated]
    .filter((q) => n(q.positive_pct) < 50)
    .sort((a, b) => n(a.positive_pct) - n(b.positive_pct) || n(b.total) - n(a.total))
  // "Polarizing" means a real split, not just a thin sample sitting at 0%
  // or 100% because only one side has voted at all — that scores 0 on the
  // polarization formula (the least polarizing value), so it would never
  // rank highly on its own, but a small pool of rated questions could still
  // pad a fixed-size list with one-sided rows. Requiring both sides removes
  // that rather than just capping the list shorter.
  const mostPolarizing = [...rated]
    .filter((q) => n(q.thumbs_up) > 0 && n(q.thumbs_down) > 0)
    .sort((a, b) => n(b.polarization) - n(a.polarization) || n(b.total) - n(a.total))

  return (
    <Shell
      actions={
        <div className="adm-actions">
          <button
            type="button"
            className="adm-icon-btn"
            aria-label={loading ? 'Refreshing…' : 'Refresh'}
            title={loading ? 'Refreshing…' : 'Refresh'}
            disabled={loading}
            onClick={() => void load()}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M20 11A8 8 0 104 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M20 5v6h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="adm-icon-btn"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 17l5-5-5-5M21 12H9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      }
      bar={
        <div className="adm-bar">
          <span className="adm-who">{user.email}</span>
          <span
            className={`adm-device-status adm-device-status--${deviceExcluded ? 'excluded' : deviceTestMode ? 'test' : 'production'}`}
            title={
              deviceExcluded
                ? 'Nothing from this device is sent at all — not even tagged.'
                : deviceTestMode
                  ? 'Everything from this device is recorded, tagged is_test — hidden from the numbers above unless "Include test data" is checked.'
                  : 'This device records as a real visitor. Sign-in normally turns test mode on automatically; seeing this is unusual.'
            }
          >
            This device: <strong>{deviceExcluded ? 'Excluded' : deviceTestMode ? 'Test' : 'Production'}</strong>
          </span>
          <label className="adm-check">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(ev) => setIncludeTest(ev.target.checked)}
            />
            Include test data
          </label>
          <label
            className="adm-check"
            title="Nothing from this device is sent at all, not even tagged. Not reversible after the fact — a device left excluded stays fully dark, including for a real session."
          >
            <input type="checkbox" checked={deviceExcluded} onChange={toggleDeviceExcluded} />
            Exclude this device from analytics
          </label>
        </div>
      }
    >
      {loadError && <p className="adm-error">Couldn’t load metrics: {loadError}</p>}

      {notAdmin ? (
        <p className="adm-note">
          Signed in as <strong>{user.email}</strong>, but that address isn’t on the analytics
          allow-list — or there’s genuinely no data yet. Add it to <code>admin_emails</code> in
          Supabase if this is unexpected.
        </p>
      ) : (
        <>
          {/*
           * Ordered by how actionable each section is, not by how the data is
           * fetched: is anything broken (Data health) → what needs a decision
           * right now (Community questions) → what's registered and whether
           * it needs a sync (Catalog) → how things are trending (Traffic,
           * Engagement) → reference and drill-down (Ratings, Content
           * performance, raw submissions).
           */}
          {client && <DataHealth client={client} includeTest={includeTest} />}

          {client && <CommunityQuestions client={client} includeTest={includeTest} />}

          {client && <CatalogPanel client={client} deck={DECK_SUMMARY} />}

          <section className="adm-section">
            <div className="adm-section__head">
              <h2>Traffic</h2>
              <div className="adm-range-group">
                <div className="adm-range" role="group" aria-label="Time range">
                  <button
                    type="button"
                    data-active={range === 'total'}
                    aria-pressed={range === 'total'}
                    onClick={() => setRange('total')}
                  >
                    All time
                  </button>
                  <button
                    type="button"
                    data-active={range === 'daily'}
                    aria-pressed={range === 'daily'}
                    onClick={() => setRange('daily')}
                  >
                    Today
                  </button>
                </div>
                <span className="adm-range-note">Traffic &amp; Engagement only</span>
              </div>
            </div>
            {range === 'daily' && dailyError && (
              <p className="adm-error">Couldn’t load today’s numbers: {dailyError}</p>
            )}
            <div className="adm-tiles" aria-busy={range === 'daily' && dailyLoading}>
              <Tile
                label="Unique visitors"
                value={range === 'daily' && dailyLoading ? '…' : n(shownTraffic?.unique_visitors)}
              />
              <Tile
                label="Sessions started"
                value={range === 'daily' && dailyLoading ? '…' : n(shownTraffic?.sessions_started)}
              />
              <Tile
                label="Sessions completed"
                value={range === 'daily' && dailyLoading ? '…' : n(shownTraffic?.sessions_completed)}
                note={`5+ questions · ${rate(n(shownTraffic?.sessions_completed), n(shownTraffic?.sessions_started))} of started`}
              />
              <Tile
                label="Opened the app"
                value={range === 'daily' && dailyLoading ? '…' : n(shownTraffic?.sessions_opened)}
                note={`${rate(n(shownTraffic?.sessions_started), n(shownTraffic?.sessions_opened))} tapped into the deck`}
              />
            </div>
          </section>

          <section className="adm-section">
            <h2>Engagement</h2>
            <div className="adm-tiles" aria-busy={range === 'daily' && dailyLoading}>
              <Tile
                label="Total ratings"
                value={range === 'daily' && dailyLoading ? '…' : n(shownEngagement?.total_ratings)}
              />
              <Tile
                label="Positive"
                value={range === 'daily' && dailyLoading ? '…' : pct(shownEngagement?.positive_pct ?? null)}
              />
              <Tile
                label="Thumbs up"
                value={range === 'daily' && dailyLoading ? '…' : n(shownEngagement?.thumbs_up)}
              />
              <Tile
                label="Thumbs down"
                value={range === 'daily' && dailyLoading ? '…' : n(shownEngagement?.thumbs_down)}
              />
              <Tile
                label="Suggestions"
                value={range === 'daily' && dailyLoading ? '…' : n(shownEngagement?.total_suggestions)}
              />
            </div>
          </section>

          <section className="adm-section">
            <h2>Ratings by category</h2>
            {metrics.byCategory.length === 0 ? (
              <p className="adm-note">Nothing rated yet.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" className="num">Up</th>
                    <th scope="col" className="num">Down</th>
                    <th scope="col" className="num">Total</th>
                    <th scope="col" className="num">Positive</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="num">{n(c.thumbs_up)}</td>
                      <td className="num">{n(c.thumbs_down)}</td>
                      <td className="num">{n(c.total)}</td>
                      <td className="num">{pct(c.positive_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="adm-section">
            <div className="adm-section__head">
              <h2>Content performance</h2>
              <label className="adm-check">
                Minimum ratings
                <select
                  value={minVotes}
                  onChange={(ev) => setMinVotes(Number(ev.target.value))}
                >
                  {[1, 3, 5, 10].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="adm-tiles adm-cards">
              <RankedQuestionCard
                label="Most liked"
                hint="Rated questions with more thumbs up than down."
                rows={mostLiked}
                metric="positive_pct"
                minVotes={minVotes}
                emptyMessage={rated.length > 0 ? 'No question has a positive majority yet.' : undefined}
              />
              <RankedQuestionCard
                label="Least liked"
                hint="Rated questions with more thumbs down than up."
                rows={leastLiked}
                metric="positive_pct"
                minVotes={minVotes}
                emptyMessage={rated.length > 0 ? 'No question has a negative majority yet.' : undefined}
              />
              <RankedQuestionCard
                label="Most polarizing"
                hint="100 is a dead-even split; 0 is unanimous. Needs votes on both sides."
                rows={mostPolarizing}
                metric="polarization"
                minVotes={minVotes}
                emptyMessage={rated.length > 0 ? 'No question has votes on both sides yet.' : undefined}
              />
              <RankedQuestionCard
                label="Every rated question"
                rows={metrics.byQuestion}
                metric="positive_pct"
                minVotes={0}
              />
            </div>
          </section>

          <section className="adm-section">
            <details>
              <summary className="adm-summary">Every raw submission ({metrics.suggestions.length})</summary>
            {metrics.suggestions.length === 0 ? (
              <p className="adm-note">None yet.</p>
            ) : (
              <ul className="adm-suggestions">
                {metrics.suggestions.map((s) => (
                  <li key={s.id}>
                    <span className="adm-meta">
                      {when(s.created_at)}
                      {s.category ? ` · ${s.category}` : ''}
                      {s.is_test ? ' · test' : ''}
                    </span>
                    {s.text}
                  </li>
                ))}
              </ul>
            )}
            </details>
          </section>
        </>
      )}
    </Shell>
  )
}

/* ----------------------------------------------------------- fragments --- */

function Shell({
  children,
  bar,
  actions,
}: {
  children: React.ReactNode
  bar?: React.ReactNode
  /** Icon-only buttons (Refresh, Sign out), pinned to the header's own
   *  upper-right corner regardless of how `bar` wraps below it. */
  actions?: React.ReactNode
}) {
  return (
    <div className="adm">
      <header className="adm-head">
        <h1>
          Sip the Tea <span>analytics</span>
        </h1>
        {bar}
        {actions}
      </header>
      <main className="adm-main">{children}</main>
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="adm-tile">
      <span className="adm-tile__value">{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span className="adm-tile__label">{label}</span>
      {note && <span className="adm-tile__note">{note}</span>}
    </div>
  )
}

/**
 * A Content performance list (Most liked, Least liked, Most polarizing,
 * Every rated question), presented as a count-forward card matching the
 * tile design used everywhere else — closed, it reads like any other tile;
 * open, it's the full table for every question in that count, never a
 * truncated preview of it.
 */
function RankedQuestionCard({
  label,
  hint,
  rows,
  metric,
  minVotes,
  emptyMessage,
}: {
  label: string
  /** A one-line clarification shown only once the card is open, above the table. */
  hint?: string
  rows: QuestionRow[]
  metric: 'positive_pct' | 'polarization'
  minVotes: number
  /** Overrides the default "nothing rated" message — e.g. when rows were
   *  filtered down to nothing by a majority requirement rather than by
   *  there being no ratings at all. */
  emptyMessage?: string
}) {
  return (
    <details className="adm-card">
      <summary className="adm-card__summary">
        <span className="adm-card__value">{rows.length.toLocaleString()}</span>
        <span className="adm-card__label">{label}</span>
      </summary>
      <div className="adm-card__body">
        {hint && <p className="adm-note adm-note--tight">{hint}</p>}
        <QuestionTable rows={rows} metric={metric} minVotes={minVotes} emptyMessage={emptyMessage} />
      </div>
    </details>
  )
}

function QuestionTable({
  rows,
  metric,
  minVotes,
  emptyMessage,
}: {
  rows: QuestionRow[]
  metric: 'positive_pct' | 'polarization'
  minVotes: number
  emptyMessage?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="adm-note">
        {emptyMessage ??
          (minVotes > 1 ? `No question has ${minVotes} ratings yet.` : 'Nothing rated yet.')}
      </p>
    )
  }
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Category</th>
            <th scope="col" className="num">Up</th>
            <th scope="col" className="num">Down</th>
            <th scope="col" className="num">{metric === 'polarization' ? 'Split' : 'Positive'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.question_id ?? q.question_text}>
              <td className="adm-q">
                {q.question_text}
                {q.question_id && <span className="adm-qid">{q.question_id}</span>}
              </td>
              <td className="adm-cat">{q.category}</td>
              <td className="num">{n(q.thumbs_up)}</td>
              <td className="num">{n(q.thumbs_down)}</td>
              <td className="num">
                {metric === 'polarization'
                  ? Number(q.polarization).toFixed(0)
                  : pct(q.positive_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
