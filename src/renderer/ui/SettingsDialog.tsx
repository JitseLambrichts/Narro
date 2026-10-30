import { useId, useRef, useState } from 'react'
import type { AccountView, SettingsView } from '../../shared/ipc'
import type { ModelId } from '../../shared/types'
import { t } from '../i18n/en'

function accountText(account: AccountView | null): string {
  if (!account) return t.checkingAccount
  if (!account.signedIn) return t.notSignedIn
  if (account.method === 'api-key') return t.usingApiKey
  return account.email ? t.signedInAs(account.email) : t.signedIn
}

export function SettingsDialog(p: {
  view: SettingsView
  account: AccountView | null
  onModelChange(model: ModelId): Promise<void>
  onSignIn(): Promise<AccountView>
  onCancelSignIn(): void
  onSignOut(): Promise<void>
  onClose(): void
}): React.JSX.Element {
  const [model, setModel] = useState<ModelId>(p.view.model)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)
  const titleId = useId()
  const modelId = useId()
  const account = p.account

  async function signIn(): Promise<void> {
    cancelled.current = false
    setError(null)
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
          <span className={account?.signedIn ? 'account-status signed-in' : 'account-status'}>
            {accountText(account)}
          </span>
          {account?.signedIn && account.method === 'claude' && (
            <button type="button" className="link-button" onClick={() => void p.onSignOut()}>
              {t.signOut}
            </button>
          )}
        </div>
        <p className="field-hint">{t.accountHint}</p>

        {account && !account.signedIn && !signingIn && (
          <button
            type="button"
            className="button primary account-action"
            onClick={() => void signIn()}
          >
            {t.signIn}
          </button>
        )}

        {signingIn && (
          <div className="sign-in">
            <p className="sign-in-wait">{t.finishInBrowser}</p>
            <p className="field-hint">{t.browserFallback}</p>
            <div className="sign-in-actions">
              <button type="button" className="button" onClick={cancel}>
                {t.cancel}
              </button>
            </div>
          </div>
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
