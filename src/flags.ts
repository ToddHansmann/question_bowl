/**
 * Feature flags.
 *
 * Deliberately small: a typed list of switches with a default, overridable
 * per build and per device. No remote flag service — the app has no read path
 * to a server on the player side, and adding one for flags would put a
 * network round trip in front of the first question.
 *
 * Resolution order, last wins:
 *   1. `FLAG_DEFAULTS` below
 *   2. build:  `VITE_FLAGS="experimentalQuestions,-onboarding"`
 *   3. device: `?qbflags=experimentalQuestions,-onboarding` — persisted to
 *      localStorage and stripped from the address bar, same pattern as
 *      `?qbtest=`. `?qbflags=reset` clears the device's overrides.
 *
 * A device override affects only that browser. None of these flags guards
 * anything security-relevant; every one is a product switch.
 *
 * Flags are read once at load. A flag is not something that changes under a
 * running session — if it did, a session's telemetry would describe two
 * different products.
 */

export const FLAG_DEFAULTS = {
  /** Record card impressions, exits, dwell, context and nominations. */
  telemetry: true,
  /** Keep undelivered telemetry on the device and retry it later (party Wi-Fi). */
  telemetryOutbox: true,
  /** The one-tap "best conversation" nomination during play. */
  bestConversation: true,
  /** The one-time welcome before a first game. */
  onboarding: true,
  /** Deal questions whose lifecycle status is `experimental`. Off: only canon is dealt. */
  experimentalQuestions: false,
  /** Swipe up to skip (distinct from swipe left for next). Off until the gesture is designed. */
  skipGesture: false,
  /** Mirror every telemetry row to the console and `window.__sttTelemetry`. */
  telemetryDebug: false,
} as const

export type FlagName = keyof typeof FLAG_DEFAULTS
export type Flags = { readonly [K in FlagName]: boolean }

const STORAGE_KEY = 'stt.flags.v1'

function isFlagName(name: string): name is FlagName {
  return Object.prototype.hasOwnProperty.call(FLAG_DEFAULTS, name)
}

/** Parses `"a,-b, c"` into `{ a: true, b: false, c: true }`, ignoring unknown names. */
export function parseFlagList(list: string | undefined | null): Partial<Record<FlagName, boolean>> {
  const out: Partial<Record<FlagName, boolean>> = {}
  if (!list) return out
  for (const raw of list.split(',')) {
    const token = raw.trim()
    if (!token) continue
    const off = token.startsWith('-')
    const name = off ? token.slice(1) : token
    if (isFlagName(name)) out[name] = !off
  }
  return out
}

export function resolveFlags(
  build: Partial<Record<FlagName, boolean>>,
  device: Partial<Record<FlagName, boolean>>,
): Flags {
  return { ...FLAG_DEFAULTS, ...build, ...device }
}

function readDeviceOverrides(): Partial<Record<FlagName, boolean>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<FlagName, boolean>> = {}
    for (const [k, v] of Object.entries(parsed)) if (isFlagName(k) && typeof v === 'boolean') out[k] = v
    return out
  } catch {
    return {}
  }
}

function applyUrlOverrides(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('qbflags')) return
    const value = params.get('qbflags')
    if (value === 'reset') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readDeviceOverrides(), ...parseFlagList(value) }))
    params.delete('qbflags')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
  } catch {
    // No window (tests) or storage blocked — defaults and build flags still apply.
  }
}

function load(): Flags {
  const hasWindow = typeof window !== 'undefined'
  if (hasWindow) applyUrlOverrides()
  let build: Partial<Record<FlagName, boolean>> = {}
  try {
    build = parseFlagList(import.meta.env?.VITE_FLAGS as string | undefined)
  } catch {
    // `import.meta.env` is Vite-only; under the Node test bundle it's absent.
  }
  return resolveFlags(build, hasWindow ? readDeviceOverrides() : {})
}

export const flags: Flags = load()
