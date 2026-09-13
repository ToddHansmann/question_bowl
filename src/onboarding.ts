/**
 * The one-time welcome before a first game.
 *
 * Shown once per browser, between tapping "Pour the first question" and the
 * first card. Completion is remembered in localStorage; if storage is
 * unavailable (private mode), it simply shows again next visit rather than
 * failing — a warm note twice is better than a broken start.
 *
 * Reset explicitly with `?qbonboarding=reset`, or from the admin dashboard.
 */
import { flags } from './flags'

const KEY = 'stt.onboarding.v1'

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

export function completeOnboarding(): void {
  try {
    localStorage.setItem(KEY, new Date().toISOString())
  } catch {
    // Not remembered; see above.
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to reset.
  }
}

/** Whether this visitor should see the welcome before their game starts. */
export function shouldShowOnboarding(): boolean {
  return flags.onboarding && !hasCompletedOnboarding()
}

function applyUrlReset(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('qbonboarding') !== 'reset') return
    resetOnboarding()
    params.delete('qbonboarding')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
  } catch {
    // No window.
  }
}

if (typeof window !== 'undefined') applyUrlReset()

/** The welcome, line by line. Kept here so copy changes never touch layout code. */
export const ONBOARDING_LINES: readonly string[] = [
  'This isn’t a static deck.',
  'The best questions stay.',
  'New questions come from the community.',
  'Every game helps shape what comes next.',
]

export const ONBOARDING_CLOSER = 'Welcome to a conversation that’s always evolving.'
export const ONBOARDING_CTA = 'Let’s Play'
