import { describe, it, expect } from 'vitest'
import { diffText } from './textDiff'

const lines = (n: number, from = 1): string => Array.from({ length: n }, (_, i) => `l${i + from}`).join('\n')

describe('diffText', () => {
  it('marks one changed line', () => {
    const d = diffText('a\nb\nc\n', 'a\nB\nc\n')
    expect(d.lines.map((l) => l.kind)).toEqual(['ctx', 'del', 'add', 'ctx'])
    expect([d.added, d.removed]).toEqual([1, 1])
  })

  it('folds long unchanged runs into a gap line', () => {
    const head = lines(20)
    const d = diffText(head + '\nx\n', head + '\ny\n')
    expect(d.lines[0]).toEqual({ kind: 'gap', text: '17 unchanged lines' })
    expect(d.lines.slice(1).map((l) => l.text)).toEqual(['l18', 'l19', 'l20', 'x', 'y'])
  })

  it('keeps context on both sides of a change in the middle', () => {
    const d = diffText(`${lines(10)}\nx\n${lines(10, 11)}\n`, `${lines(10)}\ny\n${lines(10, 11)}\n`)
    expect(d.lines.map((l) => l.text)).toEqual([
      '7 unchanged lines', 'l8', 'l9', 'l10', 'x', 'y', 'l11', 'l12', 'l13', '7 unchanged lines'
    ])
  })

  it('folds the middle of a long run between two changes', () => {
    const d = diffText(`a\n${lines(10)}\nb\n`, `A\n${lines(10)}\nB\n`)
    expect(d.lines.map((l) => l.text)).toEqual(['a', 'A', 'l1', 'l2', 'l3', '4 unchanged lines', 'l8', 'l9', 'l10', 'b', 'B'])
  })

  it('does not fold a single line into a gap', () => {
    const d = diffText(`${lines(4)}\nx\n`, `${lines(4)}\ny\n`)
    expect(d.lines.map((l) => l.text)).toEqual(['l1', 'l2', 'l3', 'l4', 'x', 'y'])
  })

  it('counts every line of a new file as added', () => {
    expect(diffText('', 'a\nb\n')).toEqual({
      lines: [{ kind: 'add', text: 'a' }, { kind: 'add', text: 'b' }],
      added: 2,
      removed: 0
    })
  })
})
