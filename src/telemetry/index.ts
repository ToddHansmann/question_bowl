/**
 * Telemetry, wired to the browser.
 *
 * One `SessionTracker` per page load (the page load *is* the session, same
 * as analytics.ts), one `Outbox` delivering its rows. The pure pieces live
 * in tracker.ts, dwell.ts and outbox.ts; this file only supplies the real
 * clock, ids, storage and network.
 *
 * Privacy posture is unchanged from analytics.ts: the anonymous device id
 * and page-load session id already used there, no accounts, no PII, no
 * fingerprinting, no third party. An excluded device records nothing.
 */
import { attribution, isDeviceExcluded, uuid } from '../analytics'
import { flags } from '../flags'
import { restInsertStatus } from '../supabase'
import { Outbox } from './outbox'
import type { TelemetryRows, TelemetryTable } from './schema'
import { SessionTracker, type TelemetrySink } from './tracker'

declare global {
  interface Window {
    /** Present only with the `telemetryDebug` flag: every row this page produced. */
    __sttTelemetry?: { table: TelemetryTable; row: unknown }[]
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const outbox = new Outbox({
  transport: (table, rows, { keepalive }) => restInsertStatus(table, rows, { keepalive }),
  storage: flags.telemetryOutbox ? safeStorage() : null,
  now: () => Date.now(),
  schedule: (fn, ms) => {
    window.setTimeout(fn, ms)
  },
})

const sink: TelemetrySink = {
  send<T extends TelemetryTable>(table: T, row: TelemetryRows[T], options?: { urgent?: boolean }) {
    if (flags.telemetryDebug) {
      window.__sttTelemetry ??= []
      window.__sttTelemetry.push({ table, row })
      console.debug('[telemetry]', table, row)
    }
    outbox.enqueue(table, row, options)
  },
}

const identity = attribution()

export const tracker = new SessionTracker({
  monotonicNow: () => performance.now(),
  wallNow: () => new Date().toISOString(),
  uuid,
  sink,
  deviceId: identity.visitor_id,
  sessionId: identity.session_id,
  isTest: () => attribution().is_test,
  enabled: flags.telemetry && !isDeviceExcluded(),
})

/** Deliver anything left over from an earlier visit, and retry whenever the connection returns. */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void outbox.flush())
  if (outbox.size > 0) window.setTimeout(() => void outbox.flush(), 3000)
}

export function displayMode(): 'standalone' | 'browser' | null {
  try {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    return iosStandalone || window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
  } catch {
    return null
  }
}

export function timeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}
