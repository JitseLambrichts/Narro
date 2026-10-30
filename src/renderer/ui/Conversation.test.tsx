// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ConversationState, Turn } from '../state/conversation'
import { Conversation } from './Conversation'

function turn(over: Partial<Turn>): Turn {
  return {
    id: 't1',
    userText: '',
    items: [],
    tasks: [],
    status: 'done',
    error: null,
    collapsed: false,
    ...over
  }
}

function show(state: ConversationState): void {
  render(<Conversation state={state} onToggleCard={vi.fn()} onDecide={vi.fn()} />)
}

describe('Conversation', () => {
  it('renders the user bubble and the agent text of a turn', () => {
    show({
      turns: [
        turn({
          userText: 'Make a customer list',
          items: [{ kind: 'text', id: 'x', text: 'I’ll create a customers table.' }]
        })
      ]
    })
    expect(screen.getByText('Make a customer list')).toBeVisible()
    expect(screen.getByText('I’ll create a customers table.')).toBeVisible()
    expect(screen.getAllByTestId('turn')).toHaveLength(1)
  })

  it('shows the error of a failed turn and the Stopped label of a stopped turn', () => {
    show({
      turns: [
        turn({
          id: 'a',
          status: 'failed',
          error: "Claude couldn't verify your API key. Check it in Settings."
        }),
        turn({ id: 'b', status: 'stopped' })
      ]
    })
    expect(
      screen.getByText("Claude couldn't verify your API key. Check it in Settings.")
    ).toBeVisible()
    expect(screen.getByText('Stopped')).toBeVisible()
  })
})
