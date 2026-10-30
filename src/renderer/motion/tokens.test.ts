import { describe, it, expect } from 'vitest'
import { fade, motionFor, spring } from './tokens'

describe('motionFor', () => {
  it('reduced motion uses short fades without movement', () => {
    const m = motionFor(true)
    expect(m.enter).toEqual({ opacity: 1, transition: { duration: 0.12 } })
    expect(m.exit).toEqual({ opacity: 0, transition: { duration: 0.12 } })
    expect(JSON.stringify(m)).not.toMatch(/"y"|"x"|scale/)
  })

  it('full motion uses the spring for layout and the fade for entering and leaving', () => {
    const m = motionFor(false)
    expect(m.layout).toEqual(spring)
    expect(m.initial).toEqual({ opacity: 0, y: 10 })
    expect(m.enter).toEqual({ opacity: 1, y: 0, transition: fade })
    expect(m.exit).toEqual({ opacity: 0, transition: fade })
  })
})
