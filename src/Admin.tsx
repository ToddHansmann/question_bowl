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
import { isTestMode, setTestMode } from './analytics'
import { getClient, supabaseConfigured } from './supabase'
import './admin.css'

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
  const [testDevice, setTestDevice] = useState(() => isTestMode())

  const [metrics, setMetrics] = useState<Metrics>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

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
   * Signing in to the dashboard turns test mode on for this device. The
   * whole point of the flag is the case where the admin is playing rather
   * than reading numbers, and that's a decision best made once, here, rather
   * than remembered before every demo.
   */
  useEffect(() => {
    if (user && !isTestMode()) {
      setTestMode(true)
      setTestDevice(true)
    }
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

  function toggleTestDevice() {
    const next = !testDevice
    setTestMode(next)
    setTestDevice(next)
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
  const notAdmin =
    !loading &&
    !loadError &&
    t !== null &&
    n(t.unique_visitors) === 0 &&
    n(e?.total_ratings) === 0 &&
    n(e?.total_suggestions) === 0

  const rated = metrics.byQuestion.filter((q) => n(q.total) >= minVotes)
  const mostLiked = [...rated]
    .sort((a, b) => n(b.positive_pct) - n(a.positive_pct) || n(b.total) - n(a.total))
    .slice(0, 10)
  const mostPolarizing = [...rated]
    .sort((a, b) => n(b.polarization) - n(a.polarization) || n(b.total) - n(a.total))
    .slice(0, 10)

  return (
    <Shell
      bar={
        <div className="adm-bar">
          <span className="adm-who">{user.email}</span>
          <label className="adm-check">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(ev) => setIncludeTest(ev.target.checked)}
            />
            Include test data
          </label>
          <label className="adm-check">
            <input type="checkbox" checked={testDevice} onChange={toggleTestDevice} />
            Test mode on this device
          </label>
          <button type="button" className="adm-btn adm-btn--quiet" onClick={() => void load()}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="adm-btn adm-btn--quiet" onClick={() => void signOut()}>
            Sign out
          </button>
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
          <section className="adm-section">
            <h2>Traffic</h2>
            <div className="adm-tiles">
              <Tile label="Unique visitors" value={n(t?.unique_visitors)} />
              <Tile label="Sessions started" value={n(t?.sessions_started)} />
              <Tile
                label="Sessions completed"
                value={n(t?.sessions_completed)}
                note={`5+ questions · ${rate(n(t?.sessions_completed), n(t?.sessions_started))} of started`}
              />
              <Tile
                label="Opened the app"
                value={n(t?.sessions_opened)}
                note={`${rate(n(t?.sessions_started), n(t?.sessions_opened))} tapped into the deck`}
              />
            </div>
          </section>

          <section className="adm-section">
            <h2>Engagement</h2>
            <div className="adm-tiles">
              <Tile label="Total ratings" value={n(e?.total_ratings)} />
              <Tile label="Positive" value={pct(e?.positive_pct ?? null)} />
              <Tile label="Thumbs up" value={n(e?.thumbs_up)} />
              <Tile label="Thumbs down" value={n(e?.thumbs_down)} />
              <Tile label="Suggestions" value={n(e?.total_suggestions)} />
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
                    <th>Category</th>
                    <th className="num">Up</th>
                    <th className="num">Down</th>
                    <th className="num">Total</th>
                    <th className="num">Positive</th>
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

            <h3>Most liked</h3>
            <QuestionTable rows={mostLiked} metric="positive_pct" minVotes={minVotes} />

            <h3>Most polarizing</h3>
            <p className="adm-note adm-note--tight">
              100 is a dead-even split; 0 is unanimous.
            </p>
            <QuestionTable rows={mostPolarizing} metric="polarization" minVotes={minVotes} />

            <h3>Every rated question</h3>
            <QuestionTable rows={metrics.byQuestion} metric="positive_pct" minVotes={0} />
          </section>

          <section className="adm-section">
            <h2>Suggestions</h2>
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
          </section>
        </>
      )}
    </Shell>
  )
}

/* ----------------------------------------------------------- fragments --- */

function Shell({ children, bar }: { children: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <div className="adm">
      <header className="adm-head">
        <h1>
          Question Bowl <span>analytics</span>
        </h1>
        {bar}
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

function QuestionTable({
  rows,
  metric,
  minVotes,
}: {
  rows: QuestionRow[]
  metric: 'positive_pct' | 'polarization'
  minVotes: number
}) {
  if (rows.length === 0) {
    return (
      <p className="adm-note">
        {minVotes > 1
          ? `No question has ${minVotes} ratings yet.`
          : 'Nothing rated yet.'}
      </p>
    )
  }
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Category</th>
            <th className="num">Up</th>
            <th className="num">Down</th>
            <th className="num">{metric === 'polarization' ? 'Split' : 'Positive'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.question_text}>
              <td className="adm-q">{q.question_text}</td>
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
