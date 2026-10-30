import { describe, it, expect, beforeEach } from 'vitest'
import type { AppEvent, VisualChange } from '../../shared/types'
import { Director, MAX_LAG_MS, MIN_VISIBLE_MS } from './director'

const text: AppEvent = { kind: 'text', turnId: 't', at: 0, text: 'hi' }
function change(id: string, phase: VisualChange['phase']): AppEvent {
  return {
    kind: 'change',
    turnId: 't',
    at: 0,
    change: {
      id,
      toolUseId: id,
      targetKey: `file:${id}`,
      phase,
      change: { type: 'activity', items: [] }
    }
  }
}
const startA = change('a', 'start')
const startB = change('b', 'start')
const doneA = change('a', 'done')

let d: Director
beforeEach(() => {
  d = new Director()
})

describe('Director', () => {
  it('uses the documented defaults', () => {
    expect([MIN_VISIBLE_MS, MAX_LAG_MS]).toEqual([600, 2000])
  })

  it('releases text immediately', () => {
    d.push(text, 0)
    expect(d.drain(0)).toEqual([text])
    expect(d.nextWakeAt()).toBeNull()
  })

  it('keeps each new card visible for MIN_VISIBLE_MS before the next', () => {
    d.push(startA, 0)
    d.push(startB, 0)
    expect(d.drain(0)).toEqual([startA])
    expect(d.nextWakeAt()).toBe(600)
    expect(d.drain(599)).toEqual([])
    expect(d.drain(600)).toEqual([startB])
  })

  it('keeps order: text behind a waiting card waits too', () => {
    d.push(startA, 0)
    d.push(startB, 0)
    d.push(text, 0)
    expect(d.drain(0)).toEqual([startA])
    expect(d.drain(600)).toEqual([startB, text])
  })

  it('done and failed phases are not held back', () => {
    d.push(startA, 0)
    d.push(doneA, 10)
    expect(d.drain(10)).toEqual([startA, doneA])
  })

  it('catches up: after MAX_LAG_MS everything waiting is released at once', () => {
    const starts = Array.from({ length: 10 }, (_, i) => change(`f${i}`, 'start'))
    starts.forEach((s) => d.push(s, 0))
    expect(d.drain(0)).toHaveLength(1)
    expect(d.drain(2000)).toHaveLength(9)
    expect(d.nextWakeAt()).toBeNull()
  })

  it('wakes up for the lag limit when that comes before the gate opens', () => {
    const slow = new Director({ minVisibleMs: 5000, maxLagMs: 2000 })
    slow.push(startA, 0)
    slow.push(startB, 100)
    slow.drain(100)
    expect(slow.nextWakeAt()).toBe(2100)
  })
})
