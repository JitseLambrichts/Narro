import type { AppEvent } from '../../shared/types'

export const MIN_VISIBLE_MS = 600
export const MAX_LAG_MS = 2000

// A new card is paced: it waits until the previous new card has been on screen long enough.
function isPaced(e: AppEvent): boolean {
  return e.kind === 'change' && e.change.phase === 'start'
}

// Sets the tempo of what appears on screen: new cards get a moment of their own,
// but what you see never falls more than maxLagMs behind what the agent did.
export class Director {
  private queue: { event: AppEvent; receivedAt: number }[] = []
  private gateUntil = -Infinity
  private minVisibleMs: number
  private maxLagMs: number

  constructor(opts: { minVisibleMs?: number; maxLagMs?: number } = {}) {
    this.minVisibleMs = opts.minVisibleMs ?? MIN_VISIBLE_MS
    this.maxLagMs = opts.maxLagMs ?? MAX_LAG_MS
  }

  push(e: AppEvent, now: number): void {
    this.queue.push({ event: e, receivedAt: now })
  }

  drain(now: number): AppEvent[] {
    const head = this.queue[0]
    if (!head) return []
    if (now - head.receivedAt >= this.maxLagMs) {
      const all = this.queue.map((q) => q.event)
      this.queue = []
      this.gateUntil = now
      return all
    }
    const released: AppEvent[] = []
    while (this.queue.length > 0) {
      const { event } = this.queue[0]
      if (isPaced(event)) {
        if (now < this.gateUntil) break
        this.gateUntil = now + this.minVisibleMs
      }
      released.push(event)
      this.queue.shift()
    }
    return released
  }

  nextWakeAt(): number | null {
    const head = this.queue[0]
    if (!head) return null
    return Math.min(this.gateUntil, head.receivedAt + this.maxLagMs)
  }
}
