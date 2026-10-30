// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer } from './Composer'

function setup(running = false, disabled = false) {
  const onSend = vi.fn()
  const onStop = vi.fn()
  render(<Composer running={running} disabled={disabled} onSend={onSend} onStop={onStop} />)
  return { onSend, onStop, box: screen.getByRole('textbox'), user: userEvent.setup() }
}

describe('Composer', () => {
  it('shows the placeholder and a Send button', () => {
    const { box } = setup()
    expect(box).toHaveAttribute('placeholder', 'Ask anything…')
    expect(screen.getByRole('button', { name: 'Send' })).toBeVisible()
  })

  it('Enter sends the trimmed text and clears the field', async () => {
    const { box, user, onSend } = setup()
    await user.type(box, '  Add an email column  {Enter}')
    expect(onSend).toHaveBeenCalledWith('Add an email column')
    expect(box).toHaveValue('')
  })

  it('the Send button sends too', async () => {
    const { box, user, onSend } = setup()
    await user.type(box, 'Hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Hi')
  })

  it('Shift+Enter adds a newline instead of sending; empty text never sends', async () => {
    const { box, user, onSend } = setup()
    await user.type(box, 'a{Shift>}{Enter}{/Shift}b')
    expect(box).toHaveValue('a\nb')
    await user.clear(box)
    await user.type(box, '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('while running the button is Stop and Enter does not send', async () => {
    const { box, user, onSend, onStop } = setup(true)
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalled()
    await user.type(box, 'x{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(box).toHaveValue('x')
  })

  it('disabled turns off the field and the button', () => {
    const { box } = setup(false, true)
    expect(box).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })
})
