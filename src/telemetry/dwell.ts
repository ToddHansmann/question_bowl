/**
 * Dwell timing for one card on screen.
 *
 * Three accumulators, all integer milliseconds, all measured on a monotonic
 * clock (`performance.now()` in the browser) so a wall-clock change can't
 * produce negative or inflated time:
 *
 * - `visibleMs`  — the page was visible and this card was the one showing.
 *                  Pauses the instant the page is hidden (tab switched, app
 *                  backgrounded, screen locked) and resumes when it returns.
 * - `obscuredMs` — the part of `visibleMs` during which something covered
 *                  the card (the menu). Kept separate rather than subtracted,
 *                  so either definition of "looking at the question" can be
 *                  computed later.
 * - `hiddenMs`   — the page was hidden while this card was the current one.
 *                  Some platforms suspend the monotonic clock while a page is
 *                  frozen, so this can under-count long backgrounds; the wall
 *                  timestamps on the exit row are the authority for elapsed
 *                  real time.
 *
 * Pure: no DOM, no timers. The caller reports state changes.
 */
export type DwellReading = {
  visibleMs: number
  obscuredMs: number
  hiddenMs: number
  elapsedMs: number
}

export class DwellClock {
  private readonly now: () => number
  private readonly startedAt: number
  private last: number
  private pageVisible: boolean
  private obscured: boolean
  private visible = 0
  private covered = 0
  private hidden = 0
  private stopped: DwellReading | null = null

  constructor(now: () => number, pageVisible: boolean, obscured = false) {
    this.now = now
    this.startedAt = now()
    this.last = this.startedAt
    this.pageVisible = pageVisible
    this.obscured = obscured
  }

  private advance(): void {
    const t = this.now()
    const delta = Math.max(0, t - this.last)
    this.last = Math.max(this.last, t)
    if (this.pageVisible) {
      this.visible += delta
      if (this.obscured) this.covered += delta
    } else {
      this.hidden += delta
    }
  }

  /** Returns true if the state actually changed. */
  setPageVisible(visible: boolean): boolean {
    if (this.stopped || visible === this.pageVisible) return false
    this.advance()
    this.pageVisible = visible
    return true
  }

  /** Returns true if the state actually changed. */
  setObscured(obscured: boolean): boolean {
    if (this.stopped || obscured === this.obscured) return false
    this.advance()
    this.obscured = obscured
    return true
  }

  get isPageVisible(): boolean {
    return this.pageVisible
  }

  read(): DwellReading {
    if (this.stopped) return this.stopped
    this.advance()
    return {
      visibleMs: Math.round(this.visible),
      obscuredMs: Math.round(this.covered),
      hiddenMs: Math.round(this.hidden),
      elapsedMs: Math.round(Math.max(0, this.last - this.startedAt)),
    }
  }

  /** Freezes the reading. Later state changes and reads return the same values. */
  stop(): DwellReading {
    if (this.stopped) return this.stopped
    const reading = this.read()
    this.stopped = reading
    return reading
  }
}
