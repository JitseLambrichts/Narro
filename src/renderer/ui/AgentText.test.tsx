// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentText } from './AgentText'

function show(text: string): HTMLElement {
  return render(<AgentText text={text} />).container
}

describe('AgentText', () => {
  it('renders bold text and lists instead of showing the markdown signs', () => {
    const c = show(
      'Dit is er veranderd:\n- **Altijd licht:** de app volgt de Mac niet meer.\n- **Donkerblauw** in plaats van paars.'
    )
    expect(screen.getByText('Altijd licht:').tagName).toBe('STRONG')
    expect(c.querySelectorAll('ul > li')).toHaveLength(2)
    expect(c.textContent).not.toContain('**')
    expect(c.textContent).not.toMatch(/^- /m)
  })

  it('renders headings, inline code and code blocks', () => {
    const c = show('## Next steps\n\nRun `npm test` first.\n\n```bash\nnpm run dev\n```')
    expect(screen.getByRole('heading', { name: 'Next steps' })).toBeVisible()
    expect(screen.getByText('npm test').tagName).toBe('CODE')
    expect(c.querySelector('pre > code')?.textContent).toBe('npm run dev\n')
  })

  it('renders tables and numbered lists', () => {
    const c = show('1. One\n2. Two\n\n| Colour | Meaning |\n| --- | --- |\n| Green | Added |')
    expect(c.querySelectorAll('ol > li')).toHaveLength(2)
    expect(screen.getByRole('table')).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Added' })).toBeVisible()
  })

  it('opens links outside the app', () => {
    show('See [the docs](https://example.com/docs).')
    const link = screen.getByRole('link', { name: 'the docs' })
    expect(link).toHaveAttribute('href', 'https://example.com/docs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('drops links with unsafe protocols', () => {
    show('[click](javascript:alert(1))')
    expect(screen.getByText('click')).not.toHaveAttribute(
      'href',
      expect.stringContaining('javascript')
    )
  })

  it('never turns HTML from the answer into real elements', () => {
    const c = show('Look: <img src=x onerror="alert(1)"> <b>bold</b>')
    expect(c.querySelector('img')).toBeNull()
    expect(c.querySelector('b')).toBeNull()
  })

  it('shows the description of an image instead of loading it', () => {
    const c = show('![The new logo](https://example.com/logo.png)')
    expect(c.querySelector('img')).toBeNull()
    expect(screen.getByText('The new logo')).toBeVisible()
  })

  it('keeps half-finished markdown readable while it streams in', () => {
    const c = show('Working on **the col')
    expect(c.textContent).toBe('Working on **the col')
  })
})
