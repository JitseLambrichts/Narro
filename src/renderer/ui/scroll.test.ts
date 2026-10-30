import { describe, it, expect } from 'vitest'
import { isNearBottom } from './scroll'

describe('isNearBottom', () => {
  it.each([
    [{ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }, true], // at the very bottom
    [{ scrollTop: 530, scrollHeight: 1000, clientHeight: 400 }, true], // 70px from the bottom
    [{ scrollTop: 500, scrollHeight: 1000, clientHeight: 400 }, false] // 100px from the bottom
  ])('isNearBottom(%o) is %s', (el, expected) => expect(isNearBottom(el)).toBe(expected))

  it('accepts a custom threshold', () => {
    expect(isNearBottom({ scrollTop: 500, scrollHeight: 1000, clientHeight: 400 }, 100)).toBe(true)
  })
})
