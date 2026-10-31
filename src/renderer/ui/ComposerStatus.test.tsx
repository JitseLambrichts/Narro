// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FileChange } from '../../shared/types'
import type { CardModel, Turn } from '../state/conversation'
import { currentStep, turnDiffstat } from '../state/turnStatus'
import { ComposerStatus } from './ComposerStatus'

function file(path: string, added: number, removed: number): FileChange {
  return { type: 'file', path, status: 'modified', lines: [], added, removed, tooLarge: false }
}
function card(over: Partial<CardModel>): CardModel {
  return {
    id: Math.random().toString(),
    targetKey: 'k',
    status: 'done',
    change: file('a.ts', 1, 0),
    files: null,
    startedAt: 0,
    lastAt: 0,
    expanded: false,
    working: [],
    ...over
  }
}
function turn(items: CardModel[], status: Turn['status'] = 'running'): Turn {
  return {
    id: 't',
    userText: 'x',
    items: items.map((c) => ({ kind: 'card', id: c.id, card: c })),
    tasks: [],
    status,
    error: null,
    collapsed: false,
    startedAt: 0,
    endedAt: null,
    thinking: ''
  }
}

describe('ComposerStatus', () => {
  it('adds up the lines of every file card, groups included', () => {
    const t = turn([
      card({ change: file('a.ts', 10, 2) }),
      card({ files: [file('b.ts', 5, 1), file('c.ts', 0, 4)], change: file('c.ts', 0, 4) })
    ])
    expect(turnDiffstat(t)).toEqual({ added: 15, removed: 7 })
  })

  it('names the step in progress, or Thinking between steps', () => {
    expect(currentStep(turn([card({})]))).toBe('Thinking')
    const command = card({
      status: 'working',
      change: {
        type: 'command',
        command: 'git push',
        description: 'Pushing 3 commits to origin',
        status: 'running',
        durationMs: null,
        changedFiles: [],
        outputTail: [],
        tables: []
      }
    })
    expect(currentStep(turn([card({}), command]))).toBe('Pushing 3 commits to origin')
  })

  it('shows the step and the line counts while Claude works', () => {
    render(<ComposerStatus turn={turn([card({ change: file('a.ts', 482, 37) })])} />)
    expect(screen.getByText('Thinking')).toBeVisible()
    expect(screen.getByText('+482')).toBeVisible()
    expect(screen.getByText('−37')).toBeVisible()
    expect(document.querySelectorAll('.block.add')).toHaveLength(5)
  })

  it('keeps only the line counts once the turn is over, and hides when nothing changed', () => {
    const { rerender } = render(
      <ComposerStatus turn={turn([card({ change: file('a.ts', 3, 3) })], 'done')} />
    )
    expect(screen.queryByText('Thinking')).toBeNull()
    expect(document.querySelectorAll('.block.add')).toHaveLength(3)
    rerender(<ComposerStatus turn={turn([], 'done')} />)
    expect(screen.queryByTestId('composer-status')).toBeNull()
  })
})
