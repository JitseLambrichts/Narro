import { useState } from 'react'
import { t } from '../i18n/en'

export function Composer(p: {
  running: boolean
  disabled: boolean
  onSend(text: string): void
  onStop(): void
}): React.JSX.Element {
  const [text, setText] = useState('')

  function send(): void {
    const trimmed = text.trim()
    if (p.running || p.disabled || trimmed === '') return
    p.onSend(trimmed)
    setText('')
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <textarea
        className="composer-input"
        rows={1}
        placeholder={t.askPlaceholder}
        value={text}
        disabled={p.disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        }}
      />
      {p.running ? (
        <button type="button" className="button composer-button" onClick={p.onStop}>
          {t.stop}
        </button>
      ) : (
        <button type="submit" className="button primary composer-button" disabled={p.disabled}>
          {t.send}
        </button>
      )}
    </form>
  )
}
