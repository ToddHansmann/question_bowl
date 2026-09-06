import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, categoryByIndex, basePool, questions, type Category } from './questions'
import { back, forward, initialDeck, makeBag, type Deck, type Pool } from './deck'

/* ------------------------------------------------------------- gesture --- */

const DISTANCE = 56 // px before a swipe counts
const FLICK_DISTANCE = 18 // px, when thrown fast
const FLICK_VELOCITY = 0.55 // px per ms
const EXIT_MS = 260
const LANDING_MS = 240 // landing fade before the deck mounts

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
  // Every expansion category starts off — a fresh session opens on the
  // original 114 until someone deliberately opts into more.
  const [enabledCategories, setEnabledCategories] = useState<ReadonlySet<Category>>(
    () => new Set(),
  )
  const [menuOpen, setMenuOpen] = useState(false)

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

  // Base questions are always in the pool; enabled categories are mixed in
  // alongside them. Indices are absolute into `questions`, so toggling a
  // category never invalidates anything already sitting in history.
  const pool: Pool = useMemo(() => {
    if (enabledCategories.size === 0) return basePool
    const p: number[] = []
    for (let i = 0; i < questions.length; i++) {
      const category = categoryByIndex[i]
      if (category === null || enabledCategories.has(category)) p.push(i)
    }
    return p
  }, [enabledCategories])

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
  const canGoBack = deck.cursor > 0

  /** Advance (1) or retreat (-1), throwing the current question that way. */
  function go(direction: 1 | -1, from: number) {
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

  function toggleCategory(category: Category) {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
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
        setMenuOpen(false)
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

      <button
        type="button"
        className="dice"
        aria-label="New question"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(1, 0)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="8.2" cy="8.2" r="1.45" fill="currentColor" />
          <circle cx="15.8" cy="8.2" r="1.45" fill="currentColor" />
          <circle cx="12" cy="12" r="1.45" fill="currentColor" />
          <circle cx="8.2" cy="15.8" r="1.45" fill="currentColor" />
          <circle cx="15.8" cy="15.8" r="1.45" fill="currentColor" />
        </svg>
      </button>

      {menuOpen && (
        <div
          className="menu-backdrop"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMenuOpen(false)}
        >
          <nav
            className="menu-panel"
            aria-label="Question categories"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="menu-close"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              ✕
            </button>

            <h2 className="menu-title">Categories</h2>

            <div className="menu-list">
              <div className="menu-row menu-row--locked">
                <span className="menu-row__label">
                  Base Questions
                  <span className="menu-row__hint">Always included</span>
                </span>
                <span
                  className="switch"
                  data-checked="true"
                  role="switch"
                  aria-checked="true"
                  aria-disabled="true"
                  aria-label="Base Questions, always enabled"
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
          </nav>
        </div>
      )}
    </main>
  )
}
