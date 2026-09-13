import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES,
  OPEN_PACKS,
  PACKS,
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
import { flags } from './flags'
import {
  ONBOARDING_CLOSER,
  ONBOARDING_CTA,
  ONBOARDING_LINES,
  completeOnboarding,
  shouldShowOnboarding,
} from './onboarding'
import { useCardTelemetry } from './telemetry/useCardTelemetry'
import type { ExitAction } from './telemetry/schema'
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
 * The menu has two grids — Expansion Packs, then Challenges — each just
 * `PACKS` filtered by group, in the order `PACKS` already declares.
 *
 * `BULK_TOGGLE_PACKS` is what the "All Expansion Packs" preset actually
 * flips, and it is deliberately narrower than `EXPANSION_PACKS`: a bulk
 * switch must never be able to put a consent-gated pack (Sex) into the
 * shuffle without anyone agreeing to it, so gated packs are excluded and can
 * only ever be turned on one at a time, through their own disclaimer.
 */
const EXPANSION_PACKS = PACKS.filter((p) => p.group === 'expansion')
const CHALLENGE_PACKS = PACKS.filter((p) => p.group === 'challenge')
const BULK_TOGGLE_PACKS = OPEN_PACKS.filter((p) => p.group === 'expansion')

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
  const [menuView, setMenuView] = useState<'categories' | 'suggest' | 'consent' | 'about'>('categories')

  // A gated pack (Sex, Dark Room) is listed openly, same as any other, and
  // still can't be switched on without everyone agreeing first. This state is
  // per-page-load on purpose: consent is given by the people at this table,
  // tonight, and is not something a previous visit can grant.
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
  // The one-time welcome sits between the landing screen and the first card.
  const [onboarding, setOnboarding] = useState(false)
  const [onboardingLeaving, setOnboardingLeaving] = useState(false)
  // Briefly confirms a best-conversation nomination, then fades.
  const [nominationNote, setNominationNote] = useState(false)
  const nominationNoteTimer = useRef<number | undefined>(undefined)

  // Swipe-to-dismiss on the menu — its own offset/dragging state, tracked the
  // same shape as the deck's own drag above, so the gesture can be thrown
  // with the exact same distance/flick thresholds and timing.
  const [menuOffset, setMenuOffset] = useState(0)
  const [menuDragging, setMenuDragging] = useState(false)
  const [menuLeaving, setMenuLeaving] = useState(false)

  const drag = useRef<Drag | null>(null)
  const menuDrag = useRef<{ id: number; x: number; y: number; t: number; decided: boolean; horizontal: boolean } | null>(
    null,
  )
  const menuPanelRef = useRef<HTMLElement | null>(null)
  const exitTimer = useRef<number | undefined>(undefined)
  const menuExitTimer = useRef<number | undefined>(undefined)
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

  const allPacksEnabled = BULK_TOGGLE_PACKS.every((p) => enabledCategories.has(p.category))
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

  // Observes the deck and records how each card was dealt and how it left.
  // Never changes what the deck does. See telemetry/useCardTelemetry.ts.
  const telemetry = useCardTelemetry({
    started,
    deck,
    poolEmpty,
    poolSize: pool.length,
    menuOpen,
    baseEnabled,
    enabledCategories,
    consentedCategories: consented,
  })
  const currentNominated = telemetry.nominatedPosition === deck.cursor + 1

  /**
   * Advance (1) or retreat (-1), throwing the current question that way.
   * `action` says why the card is leaving; it defaults to what the direction
   * means (next or back) and only telemetry reads it.
   */
  function go(direction: 1 | -1, from: number, action?: ExitAction) {
    // Nothing to draw or browse while the pool is empty — the empty-state
    // screen is up instead of the deck, so there's no card to move anyway.
    if (poolEmpty) return
    if (direction === -1 && !canGoBack) {
      setOffset(0)
      return
    }
    telemetry.exit(action ?? (direction === 1 ? 'next' : 'back'))
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
    startTimer.current = window.setTimeout(() => {
      if (shouldShowOnboarding()) {
        trackOnce('onboarding_shown')
        setOnboarding(true)
      } else {
        setStarted(true)
      }
    }, LANDING_MS)
  }

  /** "Let's Play" on the welcome. Remembered, so it never shows again on this device. */
  function finishOnboarding() {
    if (!onboarding || onboardingLeaving) return
    completeOnboarding()
    trackOnce('onboarding_completed')
    setOnboardingLeaving(true)
    startTimer.current = window.setTimeout(() => {
      setOnboarding(false)
      setStarted(true)
    }, LANDING_MS)
  }

  /** Marks (or unmarks) the card on screen as tonight's best conversation. One per session. */
  function toggleNomination() {
    if (poolEmpty) return
    const nominating = !currentNominated
    telemetry.toggleNomination()
    window.clearTimeout(nominationNoteTimer.current)
    setNominationNote(nominating)
    if (nominating) {
      nominationNoteTimer.current = window.setTimeout(() => setNominationNote(false), 2200)
    }
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
    telemetry.thumb(value)
  }

  /**
   * Closes the menu and resets it back to the categories view for next time
   * — including the swipe-to-dismiss position, so a menu closed mid-drag (the
   * X tapped before a snap-back finished, say) never reopens already offset.
   */
  function closeMenu() {
    setMenuOpen(false)
    setMenuView('categories')
    setConsentPack(null)
    setSuggestionText('')
    setSuggestionCategory('')
    setSuggestionStatus('idle')
    setMenuOffset(0)
    setMenuDragging(false)
    setMenuLeaving(false)
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

  /** The "All Expansion Packs" preset. Gated packs always opt in alone. */
  function toggleAllCategories() {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      for (const pack of BULK_TOGGLE_PACKS) {
        if (allPacksEnabled) next.delete(pack.category)
        else next.add(pack.category)
      }
      return next
    })
  }

  // These close over this render's state, so keep fresh copies for listeners.
  const goRef = useRef(go)
  const startRef = useRef(start)
  const finishOnboardingRef = useRef(finishOnboarding)
  goRef.current = go
  startRef.current = start
  finishOnboardingRef.current = finishOnboarding

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && menuOpen) {
        e.preventDefault()
        closeMenu()
        return
      }
      const forwards = e.key === 'ArrowLeft' || e.key === ' ' || e.key === 'Enter'
      if (onboarding) {
        if (forwards) {
          e.preventDefault()
          finishOnboardingRef.current()
        }
        return
      }
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
  }, [started, menuOpen, onboarding])

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
      window.clearTimeout(menuExitTimer.current)
      window.clearTimeout(nominationNoteTimer.current)
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

    if (!d.horizontal) {
      // Swipe up to skip — only when the gesture is switched on. Off, a
      // vertical swipe does nothing, exactly as it always has.
      const dy = e.clientY - d.y
      if (flags.skipGesture && dy < -DISTANCE) go(1, 0, 'skip')
      return
    }

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

  /**
   * Swipe right, anywhere on the open menu, dismisses it — the same
   * direction, the same thresholds (DISTANCE/FLICK_DISTANCE/FLICK_VELOCITY),
   * and the same live-follow-then-throw feel as swiping to the next
   * question. Independent of `drag`: the menu sits over the deck and must
   * never fight it for a gesture.
   */
  function onMenuPointerDown(e: React.PointerEvent<HTMLElement>) {
    menuDrag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      decided: false,
      horizontal: false,
    }
  }

  function onMenuPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = menuDrag.current
    if (!d || d.id !== e.pointerId) return

    const dx = e.clientX - d.x
    const dy = e.clientY - d.y

    if (!d.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      d.decided = true
      d.horizontal = Math.abs(dx) > Math.abs(dy)
      if (d.horizontal) setMenuDragging(true)
    }
    if (!d.horizontal) return

    // Only rightward closes anything — a leftward drag pulls against a
    // rubber band instead, same damping the deck uses for a direction with
    // nothing behind it.
    setMenuOffset(dx > 0 ? dx : dx * 0.25)
  }

  function onMenuPointerUp(e: React.PointerEvent<HTMLElement>) {
    const d = menuDrag.current
    menuDrag.current = null
    if (!d || d.id !== e.pointerId) return
    setMenuDragging(false)
    if (!d.horizontal) return

    const dx = e.clientX - d.x
    const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t)
    const thrown = dx > 0 && (dx > DISTANCE || (dx > FLICK_DISTANCE && speed > FLICK_VELOCITY))

    if (thrown) {
      // Keep going the same direction, clear off the right edge — the
      // panel's own width is exactly "off screen" since it's anchored flush
      // against that edge; a little past it reads as a definite throw
      // rather than a stop right at the boundary.
      const width = menuPanelRef.current?.offsetWidth ?? 320
      setMenuLeaving(true)
      setMenuOffset(width + 24)
      window.clearTimeout(menuExitTimer.current)
      menuExitTimer.current = window.setTimeout(closeMenu, EXIT_MS)
    } else {
      setMenuOffset(0)
    }
  }

  function onMenuPointerCancel() {
    menuDrag.current = null
    setMenuDragging(false)
    setMenuOffset(0)
  }

  /**
   * A full-width preset bar — Base Questions, All Expansion Packs. Visually
   * distinct from a category pill on purpose: a preset is a bulk action, not
   * one category among many, and shouldn't read as just another item in the
   * grid below it.
   */
  function presetButton(label: string, meta: string | null, checked: boolean, onClick: () => void) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="preset"
        data-on={checked}
        onClick={onClick}
        key={label}
      >
        <span className="preset__label">
          <span className="preset__title">{label}</span>
          {meta && <span className="preset__meta">{meta}</span>}
        </span>
        <span className="preset__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="12" height="12">
            <path
              d="M4 12l6 6L20 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
    )
  }

  /**
   * One category pill — the whole button is the toggle, no separate switch.
   * Identical for Expansion Packs and Challenges; the gate, if any, lives in
   * toggleCategory, same as it always has.
   */
  function categoryPill(category: Category) {
    const checked = enabledCategories.has(category)
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${category} questions`}
        className="cat-pill"
        data-on={checked}
        onClick={() => toggleCategory(category)}
        key={category}
      >
        {category}
      </button>
    )
  }

  if (onboarding) {
    return (
      <section
        className={`landing welcome ${onboardingLeaving ? 'landing--out' : ''}`}
        aria-labelledby="welcome-closer"
      >
        <div className="landing__inner welcome__inner">
          <ul className="welcome__lines">
            {ONBOARDING_LINES.map((line, i) => (
              <li key={line} style={{ ['--i' as string]: i }}>
                {line}
              </li>
            ))}
          </ul>
          <p
            id="welcome-closer"
            className="welcome__closer"
            style={{ ['--i' as string]: ONBOARDING_LINES.length }}
          >
            {ONBOARDING_CLOSER}
          </p>
          <button type="button" className="cta welcome__cta" onClick={finishOnboarding} autoFocus>
            {ONBOARDING_CTA}
          </button>
        </div>
      </section>
    )
  }

  if (!started) {
    return (
      <section className={`landing ${leaving ? 'landing--out' : ''}`}>
        <div className="landing__inner">
          <h1 className="landing__title">
            <span className="landing__eyebrow">Gather Around</span>{' '}
            <span className="landing__name">Sip the Tea</span>
          </h1>
          <p className="landing__tagline">Answer out loud.</p>
          <p className="landing__support">Discover what people are really curious about.</p>
          <button type="button" className="cta" onClick={start}>
            Pour the first question 🫖
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

      {flags.bestConversation && !poolEmpty && !menuOpen && (
        <div className="nominate" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="nominate__btn"
            aria-label={
              currentNominated
                ? 'Tonight’s best conversation. Tap to unmark.'
                : 'Mark as tonight’s best conversation'
            }
            aria-pressed={currentNominated}
            data-selected={currentNominated}
            onClick={toggleNomination}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"
                fill={currentNominated ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="nominate__note" data-on={nominationNote && currentNominated} aria-live="polite">
            {nominationNote && currentNominated ? 'Tonight’s best conversation' : ''}
          </span>
        </div>
      )}

      {!poolEmpty && !menuOpen && (
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

      {/*
       * The drag transform lives on `.menu-backdrop` below, the element that
       * wraps *both* the dim and the panel, so the whole overlay travels as
       * one layer — the dim used to be painted by that element while the
       * transform sat on `.menu-panel__inner` two levels down, which left the
       * dim (and the panel's own surface) standing still while only the
       * panel's contents slid away.
       *
       * It can share an element with the entrance animation there, where it
       * couldn't on `.menu-panel`: `menu-backdrop-in` only has `opacity` in
       * its keyframes, so its forwards fill has no `transform` to outrank the
       * inline style with. `.menu-panel` keeps its own slide-in animation, and
       * a parent's transform composes with a child's rather than fighting it.
       */}
      {menuOpen && (
        <div
          className={`menu-backdrop ${menuDragging ? 'menu-backdrop--dragging' : ''} ${
            menuLeaving ? 'menu-backdrop--leaving' : ''
          }`}
          style={{ transform: `translate3d(${menuOffset}px, 0, 0)` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={closeMenu}
        >
          <div className="menu-backdrop__dim" />
          <nav
            ref={menuPanelRef}
            className="menu-panel"
            aria-label="Question categories"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onMenuPointerDown}
            onPointerMove={onMenuPointerMove}
            onPointerUp={onMenuPointerUp}
            onPointerCancel={onMenuPointerCancel}
          >
           <div className="menu-panel__inner">
            <button type="button" className="menu-close" aria-label="Close menu" onClick={closeMenu}>
              ✕
            </button>

            {menuView === 'categories' ? (
              <>
                <button
                  type="button"
                  className="suggest-pill"
                  onClick={() => setMenuView('suggest')}
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                    <path
                      d="M12 5v14M5 12h14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  Suggest a question
                </button>

                <div className="preset-list">
                  {presetButton('Base Questions', null, baseEnabled, toggleBase)}
                  {presetButton('All Expansion Packs', null, allPacksEnabled, toggleAllCategories)}
                </div>

                <div className="menu-group">
                  <h3 className="menu-subtitle">Expansion Packs</h3>
                  <div className="pill-grid">
                    {EXPANSION_PACKS.map(({ category }) => categoryPill(category))}
                  </div>
                </div>

                <div className="menu-group">
                  <h3 className="menu-subtitle">Challenges</h3>
                  <div className="pill-grid">
                    {CHALLENGE_PACKS.map(({ category }) => categoryPill(category))}
                  </div>
                </div>

                <button type="button" className="menu-about-link" onClick={() => setMenuView('about')}>
                  About Sip the Tea
                </button>
              </>
            ) : menuView === 'about' ? (
              <>
                <button
                  type="button"
                  className="menu-back"
                  onClick={() => setMenuView('categories')}
                >
                  ‹ Categories
                </button>

                <h2 className="menu-title">About Sip the Tea</h2>
                <div className="menu-about">
                  <p>
                    Sip the Tea began around a dinner table, with friends asking the questions they
                    actually wanted answered.
                  </p>
                  <p>
                    Today those conversations continue through every group that plays. Players suggest
                    new questions, help surface the best ones, and gradually build a living collection
                    of conversations worth having.
                  </p>
                  <p>
                    It’s meant to be played out loud, with the phone mostly forgotten. A great night
                    isn’t the one where you get through the most questions — it’s the one where a single
                    question keeps the whole table talking.
                  </p>
                  <p>
                    {flags.bestConversation &&
                      'When that happens, tap the star to mark it as tonight’s best conversation. '}
                    If there’s something you’ve always wanted to ask a room full of people, suggest
                    it. That’s how the game grows.
                  </p>
                  <p className="menu-about__closer">Thanks for pulling up a chair.</p>
                </div>
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
           </div>
          </nav>
        </div>
      )}
    </main>
  )
}
