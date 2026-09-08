import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES,
  categoryByIndex,
  basePool,
  questions,
  sourceByIndex,
  type Category,
} from './questions'
import { back, forward, initialDeck, makeBag, type Deck, type Pool } from './deck'
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
  const [menuView, setMenuView] = useState<'categories' | 'suggest'>('categories')

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

  const allPacksEnabled = CATEGORIES.every((c) => enabledCategories.has(c))
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
  const currentCategory = categoryByIndex[currentIndex]
  const currentSource = sourceByIndex[currentIndex]
  const canGoBack = deck.cursor > 0
  const currentRating = ratings[current]

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
    const next = { ...ratings, [current]: value }
    setRatings(next)
    saveRatings(next)
    void submitRating(current, currentCategory, currentSource, value)
  }

  /** Closes the menu and resets it back to the categories view for next time. */
  function closeMenu() {
    setMenuOpen(false)
    setMenuView('categories')
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

  function toggleCategory(category: Category) {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  /** One switch for every expansion pack at once. */
  function toggleAllCategories() {
    setEnabledCategories(allPacksEnabled ? new Set() : new Set(CATEGORIES))
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
            className="rate__btn rate__btn--up"
            aria-label="Good question"
            aria-pressed={currentRating === 'up'}
            data-selected={currentRating === 'up'}
            disabled={!!currentRating}
            onClick={() => rateCurrent('up')}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <rect x="7" y="3" width="6" height="12" rx="3" fill="currentColor" />
              <rect x="4" y="11" width="16" height="10" rx="3" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="rate__btn rate__btn--down"
            aria-label="Not a good question"
            aria-pressed={currentRating === 'down'}
            data-selected={currentRating === 'down'}
            disabled={!!currentRating}
            onClick={() => rateCurrent('down')}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <rect x="7" y="3" width="6" height="12" rx="3" fill="currentColor" />
              <rect x="4" y="11" width="16" height="10" rx="3" fill="currentColor" />
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

                  {CATEGORIES.map((category) => {
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
                  })}
                </div>

                <button
                  type="button"
                  className="menu-suggest-link"
                  onClick={() => setMenuView('suggest')}
                >
                  Suggest a Question
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
