import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES,
  GATED_PACKS,
  OPEN_PACKS,
  categoryByIndex,
  basePool,
  packFor,
  questionIdByIndex,
  questions,
  sourceByIndex,
  type Category,
  type Pack,
} from './questions'
import { back, forward, initialDeck, makeBag, type Deck, type Pool } from './deck'
import { SESSION_COMPLETE_AT, trackOnce } from './analytics'
import {
  loadRatings,
  saveRatings,
  submitRating,
  submitSuggestion,
  type RatingValue,
} from './feedback'

/* ------------------------------------------------------------- gesture --- */

const DISTANCE = 56 // px before a swipe counts
const FLICK_DISTANCE = 18 // px, when thrown fast
const FLICK_VELOCITY = 0.55 // px per ms
const EXIT_MS = 260
const LANDING_MS = 240 // landing fade before the deck mounts

/**
 * The menu shows packs in three groups, and they behave differently enough
 * that the split is worth naming once here rather than filtering inline.
 *
 * `ALL_PACKS_SWITCH` covers the settled packs only. The experiments are
 * deliberately left out of it: the whole point of shipping a small pack is to
 * find out whether people choose it, and a switch that turns everything on
 * would destroy that signal on the first tap. Gated packs are excluded for a
 * harder reason — a bulk switch must never be able to put explicit questions
 * into the shuffle without anyone agreeing to them.
 */
const SETTLED_PACKS = OPEN_PACKS.filter((p) => p.tier === 'expansion')
const EXPERIMENTAL_PACKS = OPEN_PACKS.filter((p) => p.tier === 'experimental')

/** Shown instead of a question when every category has been switched off. */
const EMPTY_POOL_SAYINGS = [
  'We could talk or not talk for hours.',
  'Nothing to see here.',
  'And the crowd goes mild.',
  'Is the question in the room with us?',
  'The group will meditate while you pick a category.',
]

type Drag = {
  id: number
  x: number
  y: number
  t: number
  decided: boolean
  horizontal: boolean
}

type Exiting = {
  id: number
  text: string
  category: Category | null
  from: number
}

/** Roomier type for shorter questions. */
function sizeClass(text: string): string {
  if (text.length <= 34) return 'q--xl'
  if (text.length <= 76) return 'q--lg'
  if (text.length <= 150) return 'q--md'
  return 'q--sm'
}

/* ----------------------------------------------------------------- app --- */

export default function App() {
  // A fresh session opens on the original 114: Base on, every expansion pack
  // off, until someone deliberately opts into more.
  const [baseEnabled, setBaseEnabled] = useState(true)
  const [enabledCategories, setEnabledCategories] = useState<ReadonlySet<Category>>(
    () => new Set(),
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuView, setMenuView] = useState<'categories' | 'suggest' | 'consent'>('categories')

  // Dark Room stays out of the list until someone deliberately asks for it,
  // and then still can't be switched on without everyone agreeing. Both bits
  // of state are per-page-load on purpose: consent is given by the people at
  // this table, tonight, and is not something a previous visit can grant.
  const [gatedRevealed, setGatedRevealed] = useState(false)
  const [consentPack, setConsentPack] = useState<Pack | null>(null)
  const [consented, setConsented] = useState<ReadonlySet<Category>>(() => new Set())

  // Question text → rating already given it on this device. Hydrated once;
  // kept in sync with localStorage on every change so a rate button's
  // disabled/selected state re-renders the instant it's pressed.
  const [ratings, setRatings] = useState<Record<string, RatingValue>>(() => loadRatings())

  const [suggestionText, setSuggestionText] = useState('')
  const [suggestionCategory, setSuggestionCategory] = useState('')
  const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  )

  const [deck, setDeck] = useState<Deck>(() => initialDeck(basePool))
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [seq, setSeq] = useState(0)
  const [dir, setDir] = useState(1)
  const [exiting, setExiting] = useState<Exiting | null>(null)
  const [started, setStarted] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const drag = useRef<Drag | null>(null)
  const exitTimer = useRef<number | undefined>(undefined)
  const startTimer = useRef<number | undefined>(undefined)

  // Base and every expansion pack toggle independently now. Indices are
  // absolute into `questions`, so toggling one never invalidates anything
  // already sitting in history — only what future draws can pick.
  const pool: Pool = useMemo(() => {
    const p: number[] = []
    for (let i = 0; i < questions.length; i++) {
      const category = categoryByIndex[i]
      if (category === null ? baseEnabled : enabledCategories.has(category)) p.push(i)
    }
    return p
  }, [baseEnabled, enabledCategories])

  const allPacksEnabled = SETTLED_PACKS.every((p) => enabledCategories.has(p.category))
  const poolEmpty = pool.length === 0

  // Re-rolled each time the pool newly becomes empty, and stable for as long
  // as it stays empty.
  const emptyMessage = useMemo(
    () => EMPTY_POOL_SAYINGS[Math.floor(Math.random() * EMPTY_POOL_SAYINGS.length)],
    [poolEmpty],
  )

  // `forward` only tops up the bag once it runs dry, so a category switched
  // on mid-pass wouldn't otherwise become reachable until the old, narrower
  // bag was fully drained — possibly not for a long stretch of swipes. Force
  // a fresh shuffle over the new pool the moment it changes, so newly-enabled
  // (or disabled) categories take effect on the very next draw. This only
  // touches `bag` — history and the currently shown question are untouched,
  // so it never repeats the question already on screen.
  useEffect(() => {
    setDeck((d) => ({ ...d, bag: makeBag(d.history[d.cursor], pool) }))
  }, [pool])

  const currentIndex = deck.history[deck.cursor]
  const current = questions[currentIndex]
  const currentId = questionIdByIndex[currentIndex]
  const currentCategory = categoryByIndex[currentIndex]
  const currentSource = sourceByIndex[currentIndex]
  const canGoBack = deck.cursor > 0
  // Keyed on the id, so rewording a question never resurfaces it for someone
  // who has already had their say about it.
  const currentRating = ratings[currentId]

  /** Advance (1) or retreat (-1), throwing the current question that way. */
  function go(direction: 1 | -1, from: number) {
    // Nothing to draw or browse while the pool is empty — the empty-state
    // screen is up instead of the deck, so there's no card to move anyway.
    if (poolEmpty) return
    if (direction === -1 && !canGoBack) {
      setOffset(0)
      return
    }
    // A new question is thrown left, a revisited one right — the opposite of
    // the swipe that asked for it, so the card follows the finger off screen.
    setDir(-direction)
    setExiting({ id: seq + 1, text: current, category: currentCategory, from })
    setDeck((d) => (direction === 1 ? forward(d, pool) : back(d)))
    setSeq((s) => s + 1)
    setOffset(0)
    setDragging(false)

    window.clearTimeout(exitTimer.current)
    exitTimer.current = window.setTimeout(() => setExiting(null), EXIT_MS)
  }

  /** Leave the landing screen and drop into the deck. */
  function start() {
    if (leaving || started) return
    trackOnce('session_started')
    setLeaving(true)
    startTimer.current = window.setTimeout(() => setStarted(true), LANDING_MS)
  }

  /**
   * Thumbs-up/down on the question currently on screen. Once a question has
   * a rating it can't be changed or re-sent — a second tap is a no-op — so
   * there's no path to accidentally double-submitting during normal use.
   */
  function rateCurrent(value: RatingValue) {
    if (poolEmpty || currentRating) return
    const next = { ...ratings, [currentId]: value }
    setRatings(next)
    saveRatings(next)
    void submitRating(currentId, current, currentCategory, currentSource, value)
  }

  /** Closes the menu and resets it back to the categories view for next time. */
  function closeMenu() {
    setMenuOpen(false)
    setMenuView('categories')
    setConsentPack(null)
    setSuggestionText('')
    setSuggestionCategory('')
    setSuggestionStatus('idle')
  }

  async function submitTheSuggestion() {
    const text = suggestionText.trim()
    if (!text || suggestionStatus === 'sending') return
    setSuggestionStatus('sending')
    const ok = await submitSuggestion(text, (suggestionCategory as Category) || null)
    setSuggestionStatus(ok ? 'sent' : 'error')
  }

  // Every source — Base included — is freely toggleable, even down to zero.
  // Nothing here needs to guard against an empty pool: go() refuses to draw
  // or browse while it's empty, and the empty-state screen takes over from
  // the deck until something is switched back on.

  function toggleBase() {
    setBaseEnabled((prev) => !prev)
  }

  function enableCategory(category: Category) {
    setEnabledCategories((prev) => new Set(prev).add(category))
  }

  /**
   * Switching a gated pack ON goes via the consent screen the first time
   * this session. Switching one OFF never asks — withdrawing is always
   * immediate, and needing permission to stop would be the wrong shape
   * entirely.
   */
  function toggleCategory(category: Category) {
    const pack = packFor(category)
    const turningOn = !enabledCategories.has(category)
    if (turningOn && pack.consent && !consented.has(category)) {
      setConsentPack(pack)
      setMenuView('consent')
      return
    }
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  /** Everyone at the table said yes. Remember it for the rest of the session. */
  function grantConsent(pack: Pack) {
    setConsented((prev) => new Set(prev).add(pack.category))
    enableCategory(pack.category)
    setConsentPack(null)
    setMenuView('categories')
  }

  /** One switch for the settled packs. Experiments and gated packs opt in alone. */
  function toggleAllCategories() {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      for (const pack of SETTLED_PACKS) {
        if (allPacksEnabled) next.delete(pack.category)
        else next.add(pack.category)
      }
      return next
    })
  }

  // These close over this render's state, so keep fresh copies for listeners.
  const goRef = useRef(go)
  const startRef = useRef(start)
  goRef.current = go
  startRef.current = start

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && menuOpen) {
        e.preventDefault()
        closeMenu()
        return
      }
      const forwards = e.key === 'ArrowLeft' || e.key === ' ' || e.key === 'Enter'
      if (!started) {
        if (forwards) {
          e.preventDefault()
          startRef.current()
        }
        return
      }
      if (menuOpen) return
      if (forwards) {
        e.preventDefault()
        goRef.current(1, 0)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goRef.current(-1, 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, menuOpen])

  // Fires for everyone who loads the page, whether or not they ever tap
  // past the landing screen — it's what unique visitors is counted from, and
  // the gap between it and `session_started` is the landing screen's
  // drop-off. StrictMode double-mounts in development; `trackOnce` makes
  // that a no-op rather than two visits.
  useEffect(() => {
    trackOnce('app_opened')
  }, [])

  // There's no natural end to a session — the deck never runs out — so
  // "completed" is defined rather than observed: SESSION_COMPLETE_AT
  // questions in. `history` only ever grows on a new draw, so its length is
  // exactly how many distinct questions this session has seen; walking back
  // and forward through it doesn't inflate the count.
  useEffect(() => {
    if (deck.history.length >= SESSION_COMPLETE_AT) {
      trackOnce('session_completed', { questions_seen: deck.history.length })
    }
  }, [deck.history.length])

  useEffect(
    () => () => {
      window.clearTimeout(exitTimer.current)
      window.clearTimeout(startTimer.current)
    },
    [],
  )

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (poolEmpty) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      decided: false,
      horizontal: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone; the gesture still works without capture.
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return

    const dx = e.clientX - d.x
    const dy = e.clientY - d.y

    if (!d.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      d.decided = true
      d.horizontal = Math.abs(dx) > Math.abs(dy)
      if (d.horizontal) setDragging(true)
    }
    if (!d.horizontal) return

    // Nothing behind us — pull against a rubber band instead.
    setOffset(dx > 0 && !canGoBack ? dx * 0.25 : dx)
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)

    if (!d.horizontal) return

    const dx = e.clientX - d.x
    const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t)
    const thrown =
      Math.abs(dx) > DISTANCE ||
      (Math.abs(dx) > FLICK_DISTANCE && speed > FLICK_VELOCITY)

    // Left for a new question, right to revisit the previous one.
    if (thrown) go(dx < 0 ? 1 : -1, dx > 0 && !canGoBack ? dx * 0.25 : dx)
    else setOffset(0)
  }

  function onPointerCancel() {
    drag.current = null
    setDragging(false)
    setOffset(0)
  }

  /** One switch row. Identical for every pack — the gate lives in toggleCategory. */
  function packRow(category: Category) {
    const checked = enabledCategories.has(category)
    return (
      <div className="menu-row" key={category}>
        <span className="menu-row__label">{category}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`${category} questions`}
          className="switch"
          data-checked={checked}
          onClick={() => toggleCategory(category)}
        />
      </div>
    )
  }

  if (!started) {
    return (
      <section className={`landing ${leaving ? 'landing--out' : ''}`}>
        <div className="landing__inner">
          <h1 className="landing__title">
            <span className="landing__the">The</span>{' '}
            <span className="landing__name">Question Bowl</span>
          </h1>
          <p className="landing__tagline">Answer out loud.</p>
          <button type="button" className="cta" onClick={start}>
            Roll the First Question 🎲
          </button>
        </div>
      </section>
    )
  }

  return (
    <main
      className="screen screen--enter"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {poolEmpty ? (
        <section className="empty" aria-live="polite" aria-atomic="true">
          <div className="empty__inner">
            <p className={`q ${sizeClass(emptyMessage)}`}>{emptyMessage}</p>
            <p className="empty__hint">Turn on at least one category</p>
          </div>
        </section>
      ) : (
        <>
          <div
            className="stage"
            style={{ ['--dir' as string]: dir }}
            aria-live="polite"
            aria-atomic="true"
          >
            {exiting && (
              <div
                className="slot slot--out"
                aria-hidden="true"
                key={`out-${exiting.id}`}
                style={{ ['--from' as string]: `${exiting.from}px` }}
              >
                <div className="q-wrap">
                  {exiting.category && <span className="q-eyebrow">{exiting.category}</span>}
                  <p className={`q ${sizeClass(exiting.text)}`}>{exiting.text}</p>
                </div>
              </div>
            )}

            <div className="slot" key={seq}>
              <div
                className={`q-wrap ${dragging ? 'q-wrap--dragging' : ''}`}
                style={{ transform: `translate3d(${offset}px, 0, 0)` }}
              >
                {currentCategory && <span className="q-eyebrow">{currentCategory}</span>}
                <p className={`q ${sizeClass(current)}`}>{current}</p>
              </div>
            </div>
          </div>

          <span className="hint hint--left" aria-hidden="true" data-on={true} />
          <span className="hint hint--right" aria-hidden="true" data-on={canGoBack} />
        </>
      )}

      <button
        type="button"
        className="menu-toggle"
        aria-label="Open category menu"
        aria-expanded={menuOpen}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setMenuOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <line x1="3.5" y1="7" x2="20.5" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="3.5" y1="12" x2="20.5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="3.5" y1="17" x2="20.5" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {!poolEmpty && (
        <div className="rate" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="rate__btn rate__btn--down"
            aria-label="Not a good question"
            aria-pressed={currentRating === 'down'}
            data-selected={currentRating === 'down'}
            disabled={!!currentRating}
            onClick={() => rateCurrent('down')}
          >
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
              <path
                d="M20 30L20 38C20 39.5913 20.6321 41.1174 21.7574 42.2426C22.8826 43.3679 24.4087 44 26 44L34 26L34 4L11.44 4C10.4753 3.9891 9.53925 4.32719 8.80419 4.95199C8.06913 5.57679 7.58465 6.44619 7.44 7.4L4.68 25.4C4.59299 25.9733 4.63165 26.5586 4.79332 27.1155C4.95499 27.6724 5.2358 28.1874 5.61628 28.625C5.99677 29.0625 6.46784 29.4121 6.99686 29.6496C7.52587 29.887 8.10019 30.0066 8.68 30L20 30ZM34 4L40 4C41.0609 4 42.0783 4.42143 42.8284 5.17158C43.5786 5.92172 44 6.93914 44 8L44 22C44 23.0609 43.5786 24.0783 42.8284 24.8284C42.0783 25.5786 41.0609 26 40 26L34 26"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            type="button"
            className="rate__btn rate__btn--up"
            aria-label="Good question"
            aria-pressed={currentRating === 'up'}
            data-selected={currentRating === 'up'}
            disabled={!!currentRating}
            onClick={() => rateCurrent('up')}
          >
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
              <path
                d="M28 18V10C28 8.4087 27.3679 6.88258 26.2426 5.75736C25.1174 4.63214 23.5913 4 22 4L14 22V44H36.56C37.5247 44.0109 38.4608 43.6728 39.1958 43.048C39.9309 42.4232 40.4154 41.5538 40.56 40.6L43.32 22.6C43.407 22.0267 43.3683 21.4414 43.2067 20.8845C43.045 20.3276 42.7642 19.8126 42.3837 19.375C42.0032 18.9375 41.5322 18.5879 41.0031 18.3504C40.4741 18.113 39.8998 17.9934 39.32 18H28ZM14 44H8C6.93913 44 5.92172 43.5786 5.17157 42.8284C4.42143 42.0783 4 41.0609 4 40V26C4 24.9391 4.42143 23.9217 5.17157 23.1716C5.92172 22.4214 6.93913 22 8 22H14"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      )}

      {menuOpen && (
        <div
          className="menu-backdrop"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={closeMenu}
        >
          <nav
            className="menu-panel"
            aria-label="Question categories"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="menu-close" aria-label="Close menu" onClick={closeMenu}>
              ✕
            </button>

            {menuView === 'categories' ? (
              <>
                <h2 className="menu-title">Categories</h2>

                <div className="menu-list">
                  <div className="menu-row">
                    <span className="menu-row__label">Base Questions</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={baseEnabled}
                      aria-label="Base Questions"
                      className="switch"
                      data-checked={baseEnabled}
                      onClick={toggleBase}
                    />
                  </div>

                  <h3 className="menu-subtitle">Expansion Packs</h3>

                  <div className="menu-row">
                    <span className="menu-row__label">All Expansion Packs</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={allPacksEnabled}
                      aria-label="All Expansion Packs"
                      className="switch"
                      data-checked={allPacksEnabled}
                      onClick={toggleAllCategories}
                    />
                  </div>

                  {SETTLED_PACKS.map(({ category }) => packRow(category))}

                  <h3 className="menu-subtitle">Experimental</h3>
                  <p className="menu-blurb">
                    Small packs, still finding out if they land.
                  </p>

                  {EXPERIMENTAL_PACKS.map(({ category }) => packRow(category))}

                  {gatedRevealed ? (
                    GATED_PACKS.map(({ category }) => packRow(category))
                  ) : (
                    <button
                      type="button"
                      className="menu-reveal"
                      onClick={() => setGatedRevealed(true)}
                    >
                      Show the explicit pack
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="menu-suggest-link"
                  onClick={() => setMenuView('suggest')}
                >
                  Suggest a Question
                </button>
              </>
            ) : menuView === 'consent' && consentPack ? (
              <>
                <button
                  type="button"
                  className="menu-back"
                  onClick={() => {
                    setConsentPack(null)
                    setMenuView('categories')
                  }}
                >
                  ‹ Categories
                </button>

                <h2 className="menu-title">{consentPack.category}</h2>
                <p className="menu-consent">{consentPack.consent}</p>
                <button
                  type="button"
                  className="menu-consent-yes"
                  onClick={() => grantConsent(consentPack)}
                >
                  Everyone here agrees
                </button>
                <button
                  type="button"
                  className="menu-consent-no"
                  onClick={() => {
                    setConsentPack(null)
                    setMenuView('categories')
                  }}
                >
                  Not tonight
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="menu-back"
                  onClick={() => setMenuView('categories')}
                >
                  ‹ Categories
                </button>

                <h2 className="menu-title">Suggest a Question</h2>

                {suggestionStatus === 'sent' ? (
                  <p className="menu-suggest-sent">
                    Thanks — got it. We read every one of these.
                  </p>
                ) : (
                  <form
                    className="menu-suggest-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void submitTheSuggestion()
                    }}
                  >
                    <textarea
                      className="menu-suggest-input"
                      placeholder="What should we ask?"
                      value={suggestionText}
                      maxLength={300}
                      rows={4}
                      onChange={(e) => setSuggestionText(e.target.value)}
                    />
                    <select
                      className="menu-suggest-select"
                      aria-label="Category (optional)"
                      value={suggestionCategory}
                      onChange={(e) => setSuggestionCategory(e.target.value)}
                    >
                      <option value="">No preference</option>
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="menu-suggest-submit"
                      disabled={!suggestionText.trim() || suggestionStatus === 'sending'}
                    >
                      {suggestionStatus === 'sending' ? 'Sending…' : 'Submit'}
                    </button>
                    {suggestionStatus === 'error' && (
                      <p className="menu-suggest-error">
                        Didn't send — check your connection and try again.
                      </p>
                    )}
                  </form>
                )}
              </>
            )}
          </nav>
        </div>
      )}
    </main>
  )
}
