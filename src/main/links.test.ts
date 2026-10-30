import { describe, it, expect } from 'vitest'
import { isExternalLink, isSamePage } from './links'

describe('isExternalLink', () => {
  it.each([
    ['https://example.com/docs', true],
    ['http://localhost:5173/', true],
    ['mailto:me@example.com', true],
    ['file:///etc/passwd', false],
    ['javascript:alert(1)', false],
    ['vscode://file/x', false],
    ['not a url', false]
  ])('%s → %s', (url, expected) => expect(isExternalLink(url)).toBe(expected))
})

describe('isSamePage', () => {
  it('allows reloading the app itself', () => {
    expect(isSamePage('http://localhost:5173/', 'http://localhost:5173/')).toBe(true)
    expect(
      isSamePage('file:///app/out/renderer/index.html', 'file:///app/out/renderer/index.html#x')
    ).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isSamePage('https://example.com/', 'http://localhost:5173/')).toBe(false)
    expect(isSamePage('file:///etc/passwd', 'file:///app/out/renderer/index.html')).toBe(false)
    expect(isSamePage('nonsense', 'http://localhost:5173/')).toBe(false)
  })
})
