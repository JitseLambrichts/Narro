import { useId, useRef, useState } from 'react'
import type { AccountView, SettingsView } from '../../shared/ipc'
import type { ModelId } from '../../shared/types'
import { t } from '../i18n/en'

function AccountStatus(p: { account: AccountView | null }): React.JSX.Element {
  if (!p.account) return <span className="account-status">{t.checkingAccount}</span>
  if (!p.account.signedIn) return <span className="account-status">{t.notSignedIn}</span>
  return (
    <span className="account-status signed-in">
      {p.account.email ? t.signedInAs(p.account.email) : t.signedIn}
    </span>
  )
}

export function SettingsDialog(p: {
  view: SettingsView
  account: AccountView | null
  onModelChange(model: ModelId): Promise<void>
  onSignIn(): Promise<AccountView>
  onSubmitCode(code: string): Promise<void>
  onCancelSignIn(): void
  onSignOut(): Promise<void>
  onClose(): void
}): React.JSX.Element {
  const [model, setModel] = useState<ModelId>(p.view.model)
  const [signingIn, setSigningIn] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)
  const titleId = useId()
  const codeId = useId()
  const modelId = useId()

  async function signIn(): Promise<void> {
    cancelled.current = false
    setError(null)
    setCode('')
    setSigningIn(true)
    const result = await p.onSignIn()
    setSigningIn(false)
    if (!result.signedIn && !cancelled.current) setError(t.signInFailed)
  }

  function cancel(): void {
    cancelled.current = true
    p.onCancelSignIn()
  }

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && p.onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="dialog-title">
          {t.settingsTitle}
        </h2>

        <div className="field-label">{t.accountLabel}</div>
        <div className="account-row">
          <AccountStatus account={p.account} />
          {p.account?.signedIn && (
            <button type="button" className="link-button" onClick={() => void p.onSignOut()}>
              {t.signOut}
            </button>
          )}
        </div>
        <p className="field-hint">{t.accountHint}</p>

        {p.account && !p.account.signedIn && !signingIn && (
          <button
            type="button"
            className="button primary account-action"
            onClick={() => void signIn()}
          >
            {t.signIn}
          </button>
        )}

        {signingIn && (
          <form
            className="sign-in"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) void p.onSubmitCode(code.trim())
            }}
          >
            <p className="sign-in-wait">{t.finishInBrowser}</p>
            <label className="field-label" htmlFor={codeId}>
              {t.codeLabel}
            </label>
            <input
              id={codeId}
              className="field"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="field-hint">{t.codeHint}</p>
            <div className="sign-in-actions">
              <button type="button" className="button" onClick={cancel}>
                {t.cancel}
              </button>
              <button type="submit" className="button primary" disabled={!code.trim()}>
                {t.continue}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <label className="field-label" htmlFor={modelId}>
          {t.modelLabel}
        </label>
        <select
          id={modelId}
          className="field"
          value={model}
          onChange={(e) => {
            const next = e.target.value as ModelId
            setModel(next)
            void p.onModelChange(next)
          }}
        >
          {(Object.keys(t.models) as ModelId[]).map((id) => (
            <option key={id} value={id}>
              {t.models[id]}
            </option>
          ))}
        </select>

        <div className="dialog-actions">
          <button type="button" className="button" onClick={p.onClose}>
            {t.done}
          </button>
        </div>
      </div>
    </div>
  )
}
