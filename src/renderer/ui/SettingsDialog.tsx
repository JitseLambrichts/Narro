import { useId, useState } from 'react'
import type { SettingsView } from '../../shared/ipc'
import type { ModelId } from '../../shared/types'
import { t } from '../i18n/en'

// ipcRenderer.invoke wraps main-process errors as "Error invoking remote method '…': Error: <message>".
function readableError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  const i = text.lastIndexOf('Error: ')
  return i >= 0 ? text.slice(i + 'Error: '.length) : text
}

export function SettingsDialog(p: {
  view: SettingsView
  onSave(patch: { apiKey?: string; model?: ModelId }): Promise<void>
  onClose(): void
}): React.JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState<ModelId>(p.view.model)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleId = useId()
  const keyId = useId()
  const modelId = useId()

  const key = apiKey.trim()
  const canSave = !saving && (key !== '' || p.view.hasApiKey)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await p.onSave(key ? { apiKey: key, model } : { model })
    } catch (err) {
      setError(readableError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && p.onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId} className="dialog-title">
          {t.settingsTitle}
        </h2>

        <label className="field-label" htmlFor={keyId}>
          {t.apiKeyLabel}
        </label>
        <input
          id={keyId}
          className="field"
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={apiKey}
          placeholder={p.view.hasApiKey ? '••••••••••••' : 'sk-ant-…'}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="field-hint">{p.view.hasApiKey ? t.apiKeySaved : t.apiKeyHint}</p>

        <label className="field-label" htmlFor={modelId}>
          {t.modelLabel}
        </label>
        <select id={modelId} className="field" value={model} onChange={(e) => setModel(e.target.value as ModelId)}>
          {(Object.keys(t.models) as ModelId[]).map((id) => (
            <option key={id} value={id}>
              {t.models[id]}
            </option>
          ))}
        </select>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" className="button" onClick={p.onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="button primary" disabled={!canSave}>
            {t.save}
          </button>
        </div>
      </form>
    </div>
  )
}
