// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Turn } from '../state/conversation'
import { ThinkingLine } from './ThinkingLine'

function turn(over: Partial<Turn>): Turn {
  return {
    id: 't1',
    userText: 'Hi',
    items: [],
    tasks: [],
    status: 'done',
    error: null,
    collapsed: false,
    startedAt: 1000,
    endedAt: 6200,
    thinking: '',
    ...over
  }
}

describe('ThinkingLine', () => {
  it('shows Thinking with a running time while the turn runs', () => {
    render(
      <ThinkingLine
        turn={turn({ status: 'running', startedAt: Date.now() - 3000, endedAt: null })}
      />
    )
    expect(screen.getByText('Thinking')).toBeVisible()
    expect(screen.getByText('3s')).toBeVisible()
  })

  it('says how long Claude worked once the turn is over', () => {
    render(<ThinkingLine turn={turn({})} />)
    expect(screen.getByText('Worked for 5s')).toBeVisible()
    expect(screen.queryByText('Thinking')).toBeNull()
  })

  it('opens to show what Claude thought, if it shared that', async () => {
    render(<ThinkingLine turn={turn({ thinking: 'The table needs an email column.' })} />)
    expect(screen.queryByText('The table needs an email column.')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button'))
    expect(screen.getByText('The table needs an email column.')).toBeVisible()
  })

  it('cannot be opened when there are no thoughts', () => {
    render(<ThinkingLine turn={turn({})} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
