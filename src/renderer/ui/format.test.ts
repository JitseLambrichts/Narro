import { describe, it, expect } from 'vitest'
import { duration, seconds } from './format'

describe('format', () => {
  it.each([
    [2700, '2.7s'],
    [9940, '9.9s'],
    [0, '0.0s'],
    [-5, '0.0s']
  ])('seconds(%i) = %s', (ms, text) => expect(seconds(ms)).toBe(text))

  it.each([
    [400, '0s'],
    [5200, '5s'],
    [59_600, '1m'],
    [72_000, '1m 12s'],
    [180_000, '3m']
  ])('duration(%i) = %s', (ms, text) => expect(duration(ms)).toBe(text))
})
