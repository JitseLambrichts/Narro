import type { Turn } from '../state/conversation'
import { currentStep, turnDiffstat } from '../state/turnStatus'
import { t } from '../i18n/en'

const BLOCKS = 5

// Small pills above the input: the step in progress, and how much code changed this turn.
export function ComposerStatus(p: { turn: Turn | undefined }): React.JSX.Element | null {
  const { turn } = p
  if (!turn) return null
  const running = turn.status === 'running'
  const { added, removed } = turnDiffstat(turn)
  const total = added + removed
  if (!running && total === 0) return null
  const green = total === 0 ? 0 : Math.round((added / total) * BLOCKS)

  return (
    <div className="composer-status" data-testid="composer-status">
      {running && (
        <span className="status-pill">
          <span className="spinner" aria-hidden="true" />
          <span className="status-step">{currentStep(turn)}</span>
        </span>
      )}
      {total > 0 && (
        <span className="status-pill" aria-label={t.linesChanged(added, removed)}>
          <span className="stat-add">+{added}</span>
          <span className="stat-del">−{removed}</span>
          <span className="diff-blocks" aria-hidden="true">
            {Array.from({ length: BLOCKS }, (_, i) => (
              <span key={i} className={i < green ? 'block add' : 'block del'} />
            ))}
          </span>
        </span>
      )}
    </div>
  )
}
