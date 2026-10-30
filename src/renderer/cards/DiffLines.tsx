import type { DiffLine } from '../../shared/types'
import { t } from '../i18n/en'

export const MAX_DIFF_LINES = 400
// New lines slide in one after another, but never take longer than this many steps.
const MAX_STAGGER_STEPS = 20

export function DiffLines(p: { lines: DiffLine[] }): React.JSX.Element {
  const shown = p.lines.slice(0, MAX_DIFF_LINES)
  const hidden = p.lines.length - shown.length
  return (
    <div className="diff">
      {shown.map((line, i) => (
        <div
          key={i}
          className="diff-line"
          data-kind={line.kind}
          style={{ '--i': Math.min(i, MAX_STAGGER_STEPS) } as React.CSSProperties}
        >
          {line.text || ' '}
        </div>
      ))}
      {hidden > 0 && <div className="diff-more">{t.moreLines(hidden)}</div>}
    </div>
  )
}
