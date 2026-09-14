/**
 * The admin dashboard's foundation panels: the community question workflow,
 * catalog sync, and telemetry data health.
 *
 * Each panel loads on its own and fails on its own, so a database that
 * hasn't had the 2026-09-13 migrations applied yet still shows every
 * existing section of the dashboard — these just say what's missing.
 *
 * As with the rest of the dashboard, nothing here decides access. Every call
 * is a SECURITY DEFINER function that checks is_admin() itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CATALOG, CATEGORIES, communityQuestions } from '../questions'
import { LIFECYCLE_TRANSITIONS, type LifecycleStatus } from '../catalog/lifecycle'
import { QUESTION_TAGS } from '../catalog/questionTags'
import { TAG_DIMENSIONS, TAG_SCHEME_VERSION, tagCoverage } from '../catalog/tags'
import { resetOnboarding } from '../onboarding'

const MIGRATION_HINT = 'Apply the 2026-09-13 migrations in supabase/migrations (see docs/migration-notes.md).'

function describe(error: { message: string } | null): string | null {
  if (!error) return null
  return /does not exist|Could not find the function/i.test(error.message) ? `${error.message} — ${MIGRATION_HINT}` : error.message
}

/* ------------------------------------------------------------ community --- */

type QueueRow = {
  submission_id: string
  submitted_text: string
  submitted_category: string | null
  submitted_at: string
  is_test: boolean
  decision: 'accepted' | 'declined' | 'duplicate' | null
  note: string | null
  reviewer: string | null
  reviewed_at: string | null
  question_id: string | null
  status: LifecycleStatus | null
  current_text: string | null
  category: string | null
}

const STATUS_LABEL: Record<LifecycleStatus, string> = {
  draft: 'Draft',
  experimental: 'Experimental',
  canon: 'Canon',
  archived: 'Archived',
}

const ACTION_LABEL: Record<LifecycleStatus, string> = {
  draft: 'Back to draft',
  experimental: 'Move to Experimental',
  canon: 'Promote to Canon',
  archived: 'Archive',
}

/** The line an editor pastes into `communityQuestions` in questions.ts. */
function snippet(row: QueueRow, status: LifecycleStatus): string {
  const text = JSON.stringify(row.current_text ?? row.submitted_text)
  const category = row.category ? `'${row.category}'` : 'null'
  return `{ id: '${row.question_id}', category: ${category}, status: '${status}', submissionId: '${row.submission_id}', text: ${text} },`
}

export function CommunityQuestions({ client, includeTest }: { client: SupabaseClient; includeTest: boolean }) {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await client.rpc('admin_editorial_queue', { include_test: includeTest })
    setError(describe(e))
    setRows((data as QueueRow[]) ?? [])
  }, [client, includeTest])

  useEffect(() => {
    void load()
  }, [load])

  async function act(key: string, call: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key)
    const { error: e } = await call()
    setBusy(null)
    if (e) {
      window.alert(e.message)
      return
    }
    await load()
  }

  function accept(row: QueueRow) {
    const text = window.prompt('Wording for the draft (edit if needed):', row.submitted_text)
    if (text === null) return
    const category = window.prompt(
      `Category — one of: ${CATEGORIES.join(', ')}. Leave blank to play alongside Base questions.`,
      row.submitted_category ?? '',
    )
    if (category === null) return
    if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      window.alert(`"${category}" isn't a category.`)
      return
    }
    const note = window.prompt('Note (optional):', '') ?? ''
    void act(row.submission_id, () =>
      client.rpc('admin_review_submission', {
        p_submission_id: row.submission_id,
        p_decision: 'accepted',
        p_note: note || null,
        p_text: text,
        p_category: category || null,
        p_kind: category === 'Dare' || category === 'Dark Room' ? 'challenge' : 'question',
      }),
    )
  }

  function decline(row: QueueRow) {
    const note = window.prompt('Why decline? (kept for the record)', '')
    if (note === null) return
    void act(row.submission_id, () =>
      client.rpc('admin_review_submission', { p_submission_id: row.submission_id, p_decision: 'declined', p_note: note || null }),
    )
  }

  function duplicate(row: QueueRow) {
    const of = window.prompt('Which existing question id does this repeat? (e.g. base-042)', '')
    if (!of) return
    void act(row.submission_id, () =>
      client.rpc('admin_review_submission', {
        p_submission_id: row.submission_id,
        p_decision: 'duplicate',
        p_duplicate_of: of.trim(),
      }),
    )
  }

  function revise(row: QueueRow) {
    const text = window.prompt('New wording:', row.current_text ?? row.submitted_text)
    if (text === null || !text.trim()) return
    const reason = window.prompt('Reason for the change:', '')
    if (!reason) return
    void act(row.submission_id, () =>
      client.rpc('admin_revise_draft', { p_question_id: row.question_id, p_text: text, p_reason: reason }),
    )
  }

  function transition(row: QueueRow, to: LifecycleStatus) {
    const reason = window.prompt(`${ACTION_LABEL[to]} — reason (kept for the record):`, '')
    if (!reason) return
    void act(row.submission_id, () =>
      client.rpc('admin_transition_question', { p_question_id: row.question_id, p_to_status: to, p_reason: reason }),
    )
  }

  async function copy(row: QueueRow, status: LifecycleStatus) {
    try {
      await navigator.clipboard.writeText(snippet(row, status))
      setCopied(row.submission_id)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      window.prompt('Copy this into communityQuestions in src/questions.ts:', snippet(row, status))
    }
  }

  const shown = rows.filter((r) => filter === 'all' || r.decision === null || r.status === 'draft' || r.status === 'experimental')

  return (
    <section className="adm-section">
      <div className="adm-section__head">
        <h2>Community questions</h2>
        <div className="adm-range" role="group" aria-label="Filter">
          <button type="button" data-active={filter === 'open'} onClick={() => setFilter('open')}>
            Needs attention
          </button>
          <button type="button" data-active={filter === 'all'} onClick={() => setFilter('all')}>
            Everything
          </button>
        </div>
      </div>
      <p className="adm-note adm-note--tight">
        Draft → Experimental → Canon → Archived. Every move is yours; nothing promotes itself. Drafts live only here;
        Experimental and Canon ship when their line is in <code>communityQuestions</code> in questions.ts.
      </p>
      {error && <p className="adm-error">{error}</p>}
      {!error && shown.length === 0 && <p className="adm-note">Nothing waiting.</p>}
      {shown.length > 0 && (
        <ul className="adm-suggestions">
          {shown.map((row) => {
            const status = row.status
            const nexts = status ? LIFECYCLE_TRANSITIONS[status] : []
            const disabled = busy === row.submission_id
            return (
              <li key={row.submission_id} className="adm-editorial">
                <span className="adm-meta">
                  {new Date(row.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {row.submitted_category ? ` · asked for ${row.submitted_category}` : ''}
                  {row.is_test ? ' · test' : ''}
                  {row.decision && row.decision !== 'accepted' ? ` · ${row.decision}` : ''}
                </span>
                <span>{row.current_text ?? row.submitted_text}</span>
                {row.current_text && row.current_text !== row.submitted_text && (
                  <span className="adm-editorial__orig">Submitted as: {row.submitted_text}</span>
                )}
                {row.question_id && (
                  <span className="adm-qid">
                    {row.question_id}
                    {status ? ` · ${STATUS_LABEL[status]}` : ''}
                    {row.category ? ` · ${row.category}` : ''}
                  </span>
                )}
                {row.note && <span className="adm-editorial__orig">Note: {row.note}</span>}
                <div className="adm-editorial__actions">
                  {row.decision === null && (
                    <>
                      <button type="button" className="adm-chip adm-chip--primary" disabled={disabled} onClick={() => accept(row)}>
                        Accept as draft
                      </button>
                      <button type="button" className="adm-chip" disabled={disabled} onClick={() => decline(row)}>
                        Decline
                      </button>
                      <button type="button" className="adm-chip" disabled={disabled} onClick={() => duplicate(row)}>
                        Duplicate…
                      </button>
                    </>
                  )}
                  {status === 'draft' && (
                    <button type="button" className="adm-chip" disabled={disabled} onClick={() => revise(row)}>
                      Revise wording
                    </button>
                  )}
                  {nexts.map((to) => (
                    <button
                      key={to}
                      type="button"
                      className={`adm-chip ${to === 'experimental' || to === 'canon' ? 'adm-chip--primary' : ''}`}
                      disabled={disabled}
                      onClick={() => transition(row, to)}
                    >
                      {ACTION_LABEL[to]}
                    </button>
                  ))}
                  {(status === 'experimental' || status === 'canon') && (
                    <button type="button" className="adm-chip" onClick={() => void copy(row, status)}>
                      {copied === row.submission_id ? 'Copied' : 'Copy questions.ts line'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* -------------------------------------------------------------- catalog --- */

type SyncResult = {
  questions_added: number
  revisions_added: number
  statuses_recorded: number
  tags_recorded: number
  community_drift: string[]
  skipped: string[]
}

export function CatalogPanel({ client }: { client: SupabaseClient }) {
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const tagged = useMemo(() => CATALOG.filter((c) => tagCoverage(QUESTION_TAGS[c.questionId]) > 0).length, [])
  const fullyTagged = useMemo(
    () => CATALOG.filter((c) => tagCoverage(QUESTION_TAGS[c.questionId]) === TAG_DIMENSIONS.length).length,
    [],
  )

  async function sync() {
    setSyncing(true)
    setError(null)
    const payload = CATALOG.map((c) => ({ ...c, tags: QUESTION_TAGS[c.questionId] ?? {} }))
    const { data, error: e } = await client.rpc('admin_sync_catalog', {
      p_catalog: payload,
      p_tag_scheme: { version: TAG_SCHEME_VERSION, dimensions: TAG_DIMENSIONS },
    })
    setSyncing(false)
    setError(describe(e))
    setResult((data as SyncResult[] | null)?.[0] ?? null)
  }

  return (
    <section className="adm-section">
      <div className="adm-section__head">
        <h2>Catalog</h2>
        <button type="button" className="adm-btn" disabled={syncing} onClick={() => void sync()}>
          {syncing ? 'Syncing…' : 'Sync this build'}
        </button>
      </div>
      <p className="adm-note adm-note--tight">
        Registers every question, wording and tag in this build with the database, and records retirements made in
        questions.ts. Safe to run any time; run it after every deploy that changes questions.
      </p>
      <div className="adm-tiles">
        <Tile label="Questions in this build" value={CATALOG.length} note={`${CATALOG.filter((c) => c.dealt).length} dealt`} />
        <Tile label="Community shipped" value={communityQuestions.length} />
        <Tile label="Tagged" value={tagged} note={`${fullyTagged} on every dimension`} />
      </div>
      {error && <p className="adm-error">{error}</p>}
      {result && (
        <>
          <p className="adm-note">
            Added {result.questions_added} questions, {result.revisions_added} wordings, {result.statuses_recorded} status
            changes, {result.tags_recorded} tag decisions.
          </p>
          {result.community_drift.length > 0 && (
            <>
              <h3>Build and editorial record disagree</h3>
              <ul className="adm-suggestions">
                {result.community_drift.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
          {result.skipped.length > 0 && (
            <>
              <h3>Not recorded</h3>
              <ul className="adm-suggestions">
                {result.skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

/* ---------------------------------------------------------- data health --- */

type Health = {
  sessions: number
  impressions: number
  reported_exits: number
  inferred_exits: number
  superseded_exits: number
  impressions_without_session: number
  draws_without_probability: number
  nominations_in_effect: number
  thumbs: number
  last_received_at: string | null
}

export function DataHealth({ client, includeTest }: { client: SupabaseClient; includeTest: boolean }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [welcomeReset, setWelcomeReset] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await client.rpc('admin_telemetry_health', { include_test: includeTest })
      setError(describe(e))
      setHealth((data as Health[] | null)?.[0] ?? null)
    })()
  }, [client, includeTest])

  const n = (v: unknown) => Number(v ?? 0)
  const reportedPct = health && n(health.impressions) > 0 ? Math.round((100 * n(health.reported_exits)) / n(health.impressions)) : null
  const problems = health ? n(health.superseded_exits) + n(health.impressions_without_session) + n(health.draws_without_probability) : 0

  return (
    <section className="adm-section">
      <h2>Data health</h2>
      <p className="adm-note adm-note--tight">
        Whether conversation data is arriving intact. These are pipeline checks, never goals — more cards is not a better
        night.
      </p>
      {error && <p className="adm-error">{error}</p>}
      {health && (
        <div className="adm-tiles">
          <Tile label="Sessions recorded" value={n(health.sessions)} />
          <Tile label="Exits reported" value={reportedPct === null ? '—' : `${reportedPct}%`} note={`${n(health.inferred_exits)} inferred`} />
          <Tile label="Best-conversation nominations" value={n(health.nominations_in_effect)} />
          <Tile
            label="Integrity problems"
            value={problems}
            note={problems === 0 ? 'none' : `${n(health.superseded_exits)} superseded · ${n(health.impressions_without_session)} orphaned · ${n(health.draws_without_probability)} missing probability`}
          />
          <Tile
            label="Last row received"
            value={health.last_received_at ? new Date(health.last_received_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
          />
        </div>
      )}
      <p className="adm-note">
        <button
          type="button"
          className="adm-chip"
          onClick={() => {
            resetOnboarding()
            setWelcomeReset(true)
          }}
        >
          {welcomeReset ? 'Welcome will show again on this device' : 'Show the welcome again on this device'}
        </button>
      </p>
    </section>
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
