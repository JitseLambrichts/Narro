// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsDialog } from './SettingsDialog'

describe('SettingsDialog', () => {
  it('shows the key field and Save without a stored key', () => {
    render(
      <SettingsDialog
        view={{ hasApiKey: false, model: 'claude-opus-5-5' }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Anthropic API key')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible()
  })

  it('saves the key and the model', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SettingsDialog
        view={{ hasApiKey: false, model: 'claude-opus-5-5' }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText('Anthropic API key'), 'sk-ant-test')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ apiKey: 'sk-ant-test', model: 'claude-opus-5-5' })
  })

  it('offers exactly Opus 5.5 and Sonnet 5.5', () => {
    render(
      <SettingsDialog
        view={{ hasApiKey: true, model: 'claude-opus-5-5' }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const options = within(screen.getByLabelText('Model')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Claude Opus 5.5', 'Claude Sonnet 5.5'])
  })

  it('with a stored key, saving an empty field only changes the model', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SettingsDialog
        view={{ hasApiKey: true, model: 'claude-opus-5-5' }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )
    await user.selectOptions(screen.getByLabelText('Model'), 'claude-sonnet-5-5')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ model: 'claude-sonnet-5-5' })
  })

  it('shows a readable error when saving fails', async () => {
    const user = userEvent.setup()
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'settings:save': Error: Secure storage is not available on this Mac."
        )
      )
    render(
      <SettingsDialog
        view={{ hasApiKey: false, model: 'claude-opus-5-5' }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText('Anthropic API key'), 'sk-ant-test')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Secure storage is not available on this Mac.')).toBeVisible()
  })
})
