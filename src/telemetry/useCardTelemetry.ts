/**
 * The one place the deck's UI state becomes telemetry.
 *
 * App.tsx reports *intent* (`exit('next')` right before it moves the deck,
 * `thumb`, `nominate`) and this hook watches *state* (which card is on
 * screen, whether the pool is empty, whether the menu covers the card,
 * whether the page is visible) and tells the tracker. Gameplay never waits
 * on any of it, and nothing here can change what the deck does.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Deck } from '../deck'
import { flags } from '../flags'
import {
  CATALOG_VERSION,
  categoryByIndex,
  kindByIndex,
  questionIdByIndex,
  revisionIdByIndex,
  sourceByIndex,
  type Category,
} from '../questions'
import { UNIFORM_RANDOM_POLICY } from '../recommendation/uniformRandom'
import type { ContextReason } from '../recommendation/types'
import { displayMode, outbox, timeZone, tracker } from './index'
import type { ExitAction } from './schema'

export type CardTelemetryInput = {
  started: boolean
  deck: Deck
  poolEmpty: boolean
  poolSize: number
  menuOpen: boolean
  baseEnabled: boolean
  enabledCategories: ReadonlySet<Category>
  consentedCategories: ReadonlySet<Category>
}

export type CardTelemetry = {
  /** Call immediately before the deck moves away from the card on screen. */
  exit: (action: ExitAction) => void
  thumb: (value: 'up' | 'down') => void
  /** Toggle: nominates the card on screen, or clears it if it already is the nomination. */
  toggleNomination: () => void
  /** 1-based history position of this session's best-conversation nomination. */
  nominatedPosition: number | null
}

function pageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

export function useCardTelemetry(input: CardTelemetryInput): CardTelemetry {
  const { started, deck, poolEmpty, poolSize, menuOpen, baseEnabled, enabledCategories, consentedCategories } = input
  const [nominatedPosition, setNominatedPosition] = useState<number | null>(null)
  const restoredNext = useRef(false)
  const [restoreEpoch, setRestoreEpoch] = useState(0)
  const contextReason = useRef<ContextReason>('session_start')

  // 1. The session begins when the deck first appears.
  useEffect(() => {
    if (!started) return
    tracker.startSession(
      {
        app_build: import.meta.env.VITE_APP_BUILD ?? null,
        catalog_version: CATALOG_VERSION,
        policy_id: UNIFORM_RANDOM_POLICY.id,
        policy_version: UNIFORM_RANDOM_POLICY.version,
        experiment_id: 'baseline',
        experiment_arm: UNIFORM_RANDOM_POLICY.id,
        assignment_probability: 1,
        locale: typeof navigator !== 'undefined' ? navigator.language ?? null : null,
        time_zone: timeZone(),
        utc_offset_minutes: -new Date().getTimezoneOffset(),
        display_mode: displayMode(),
        flags: { ...flags },
      },
      pageVisible(),
    )
  }, [started])

  // 2. The room: which packs are on, which gated packs this table agreed to.
  //    Declared before the card effect so a snapshot exists before the first
  //    impression references one.
  useEffect(() => {
    if (!started) return
    tracker.updateContext({
      schemaVersion: 1,
      reason: contextReason.current,
      pool: {
        baseEnabled,
        enabledCategories: [...enabledCategories].sort(),
        consentedCategories: [...consentedCategories].sort(),
        size: poolSize,
      },
      group: { size: null, relationship: null },
      ceilings: { spice: null },
      dimensions: {},
    })
    contextReason.current = 'pool_changed'
  }, [started, baseEnabled, enabledCategories, consentedCategories, poolSize])

  // 3. The card on screen.
  const currentIndex = deck.history[deck.cursor]
  useEffect(() => {
    if (!started) return
    if (poolEmpty) {
      tracker.exit('pool_emptied')
      restoredNext.current = true
      return
    }
    tracker.show({
      questionId: questionIdByIndex[currentIndex],
      revisionId: revisionIdByIndex[currentIndex],
      category: categoryByIndex[currentIndex],
      source: sourceByIndex[currentIndex],
      kind: kindByIndex[currentIndex],
      position: deck.cursor + 1,
      draw: deck.draws[deck.cursor] ?? null,
      restored: restoredNext.current,
    })
    restoredNext.current = false
    // `deck.draws` is deliberately not a dependency: it only ever grows, and
    // the entry for the position on screen never changes once written.
  }, [started, poolEmpty, deck.cursor, currentIndex, restoreEpoch])

  // 4. The menu covering the card.
  useEffect(() => {
    if (started) tracker.setObscured(menuOpen)
  }, [started, menuOpen])

  // 5. The page itself: hidden, shown, torn down, restored.
  useEffect(() => {
    function onVisibility() {
      const visible = pageVisible()
      tracker.setPageVisible(visible)
      if (!visible) void outbox.flush({ keepalive: true })
    }
    function onPageHide() {
      tracker.teardown()
      void outbox.flush({ keepalive: true })
    }
    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted) return
      tracker.setPageVisible(pageVisible())
      restoredNext.current = true
      setRestoreEpoch((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  const exit = useCallback((action: ExitAction) => tracker.exit(action), [])
  const thumb = useCallback((value: 'up' | 'down') => tracker.thumb(value), [])

  const position = deck.cursor + 1
  const toggleNomination = useCallback(() => {
    if (nominatedPosition === position) {
      tracker.clearNomination()
      setNominatedPosition(null)
    } else {
      tracker.nominate()
      setNominatedPosition(position)
    }
  }, [nominatedPosition, position])

  return { exit, thumb, toggleNomination, nominatedPosition }
}
