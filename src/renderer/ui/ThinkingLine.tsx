import { useState } from 'react'
import type { Turn } from '../state/conversation'
import { t } from '../i18n/en'
import { duration } from './format'
import { useNow } from './useNow'

// "Thinking 3s" while Claude works, "Worked for 12s" afterwards. Opens to show Claude's
// thoughts when it shared them.
export function ThinkingLine(p: { turn: Turn }): React.JSX.Element {
  const { turn } = p
  const running = turn.status === 'running'
  const now = useNow(running, 250)
  const [open, setOpen] = useState(false)
  const elapsed = (turn.endedAt ?? now) - turn.startedAt
  const thoughts = turn.thinking.trim()

  return (
    <div className="thinking" data-testid="thinking">
      <button
        type="button"
        className="thinking-line"
        aria-expanded={thoughts ? open : undefined}
        disabled={!thoughts}
        onClick={() => setOpen(!open)}
      >
        <span className={thoughts ? 'chevron' : 'chevron hidden'} aria-hidden="true">
          ›
        </span>
        {running ? (
          <>
            <span className="thinking-label shimmer">{t.thinking}</span>
            <span className="thinking-time">{duration(elapsed)}</span>
          </>
        ) : (
          <span className="thinking-label">{t.workedFor(duration(elapsed))}</span>
        )}
      </button>
      {open && thoughts && <div className="thinking-text">{thoughts}</div>}
    </div>
  )
}
