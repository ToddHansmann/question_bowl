import { useEffect, useRef, useState } from 'react'
import { questions } from './questions'
import { back, forward, initialDeck, type Deck } from './deck'

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

/** Roomier type for shorter questions. */
function sizeClass(text: string): string {
  if (text.length <= 34) return 'q--xl'
  if (text.length <= 76) return 'q--lg'
  if (text.length <= 150) return 'q--md'
  return 'q--sm'
}

/* ----------------------------------------------------------------- app --- */

export default function App() {
  const [deck, setDeck] = useState<Deck>(initialDeck)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [seq, setSeq] = useState(0)
  const [dir, setDir] = useState(1)
  const [exiting, setExiting] = useState<{ id: number; text: string; from: number } | null>(null)
  const [started, setStarted] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const drag = useRef<Drag | null>(null)
  const exitTimer = useRef<number | undefined>(undefined)
  const startTimer = useRef<number | undefined>(undefined)

  const current = questions[deck.history[deck.cursor]]
  const canGoBack = deck.cursor > 0

  /** Advance (1) or retreat (-1), throwing the current question that way. */
  function go(direction: 1 | -1, from: number) {
    if (direction === -1 && !canGoBack) {
      setOffset(0)
      return
    }
    setDir(direction)
    setExiting({ id: seq + 1, text: current, from })
    setDeck(direction === 1 ? forward : back)
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

  // These close over this render's state, so keep fresh copies for listeners.
  const goRef = useRef(go)
  const startRef = useRef(start)
  goRef.current = go
  startRef.current = start

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const forwards = e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter'
      if (!started) {
        if (forwards) {
          e.preventDefault()
          startRef.current()
        }
        return
      }
      if (forwards) {
        e.preventDefault()
        goRef.current(1, 0)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goRef.current(-1, 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started])

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
    setOffset(dx < 0 && !canGoBack ? dx * 0.25 : dx)
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

    if (thrown) go(dx > 0 ? 1 : -1, dx < 0 && !canGoBack ? dx * 0.25 : dx)
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
            <p className={`q ${sizeClass(exiting.text)}`}>{exiting.text}</p>
          </div>
        )}

        <div className="slot" key={seq}>
          <p
            className={`q ${sizeClass(current)} ${dragging ? 'q--dragging' : ''}`}
            style={{ transform: `translate3d(${offset}px, 0, 0)` }}
          >
            {current}
          </p>
        </div>
      </div>

      <span className="hint hint--left" aria-hidden="true" data-on={canGoBack} />
      <span className="hint hint--right" aria-hidden="true" data-on={true} />

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
    </main>
  )
}
