// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccountView } from '../../shared/ipc'
import { SettingsDialog } from './SettingsDialog'

const signedOut: AccountView = { signedIn: false, email: null }
const signedIn: AccountView = { signedIn: true, email: 'me@example.com' }

type SignIn = Mock<() => Promise<AccountView>>

function setup(
  account: AccountView | null,
  onSignIn: SignIn = vi.fn(async () => signedIn)
): {
  onSignIn: SignIn
  onModelChange: Mock
  onSubmitCode: Mock
  onCancelSignIn: Mock
  onSignOut: Mock
  onClose: Mock
  user: ReturnType<typeof userEvent.setup>
} {
  const props = {
    view: { model: 'claude-opus-5-5' as const },
    account,
    onModelChange: vi.fn(async () => {}),
    onSignIn,
    onSubmitCode: vi.fn(async () => {}),
    onCancelSignIn: vi.fn(),
    onSignOut: vi.fn(async () => {}),
    onClose: vi.fn()
  }
  render(<SettingsDialog {...props} />)
  return { ...props, user: userEvent.setup() }
}

describe('SettingsDialog', () => {
  it('asks to sign in with Claude and never for an API key', () => {
    setup(signedOut)
    expect(screen.getByText('Not signed in')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign in with Claude' })).toBeVisible()
    expect(screen.queryByLabelText(/API key/i)).toBeNull()
  })

  it('while signing in, waits for the browser and accepts a pasted code', async () => {
    let finish!: (v: AccountView) => void
    const { user, onSignIn, onSubmitCode } = setup(
      signedOut,
      vi.fn(() => new Promise<AccountView>((r) => (finish = r)))
    )
    await user.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    expect(onSignIn).toHaveBeenCalled()
    expect(screen.getByText('Finish signing in in your browser.')).toBeVisible()
    await user.type(screen.getByLabelText('Code from the browser'), ' abc ')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onSubmitCode).toHaveBeenCalledWith('abc')
    finish(signedIn)
    expect(await screen.findByRole('button', { name: 'Sign in with Claude' })).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so when signing in did not finish', async () => {
    const { user } = setup(
      signedOut,
      vi.fn(async () => signedOut)
    )
    await user.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    expect(await screen.findByText('Signing in did not finish. Try again.')).toBeVisible()
  })

  it('cancelling stops the sign-in without an error', async () => {
    let finish!: (v: AccountView) => void
    const { user, onCancelSignIn } = setup(
      signedOut,
      vi.fn(() => new Promise<AccountView>((r) => (finish = r)))
    )
    await user.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancelSignIn).toHaveBeenCalled()
    finish(signedOut)
    expect(await screen.findByRole('button', { name: 'Sign in with Claude' })).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows who is signed in and offers to sign out', async () => {
    const { user, onSignOut } = setup(signedIn)
    expect(screen.getByText('Signed in as me@example.com')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Sign in with Claude' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalled()
  })

  it('offers exactly Opus 5.5 and Sonnet 5.5 and saves a new choice right away', async () => {
    const { user, onModelChange } = setup(signedIn)
    const options = within(screen.getByLabelText('Model')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Claude Opus 5.5', 'Claude Sonnet 5.5'])
    await user.selectOptions(screen.getByLabelText('Model'), 'claude-sonnet-5-5')
    expect(onModelChange).toHaveBeenCalledWith('claude-sonnet-5-5')
  })

  it('Done closes the dialog', async () => {
    const { user, onClose } = setup(null)
    expect(screen.getByText('Checking…')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })
})
