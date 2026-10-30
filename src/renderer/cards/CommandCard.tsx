import type { CommandChange } from '../../shared/types'
import { t } from '../i18n/en'

export function CommandCard(p: { change: CommandChange }): React.JSX.Element {
  const { change } = p
  return (
    <div className="command">
      <div className="command-line">
        <code className="command-text">{change.command}</code>
        {change.durationMs !== null && (
          <span className="command-time">{t.seconds(change.durationMs)}</span>
        )}
      </div>
      {change.changedFiles.length > 0 && (
        <ul className="command-files" aria-label={t.changedFiles}>
          {change.changedFiles.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {change.outputTail.length > 0 && (
        <pre className="command-output">
          {change.outputTail.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </pre>
      )}
    </div>
  )
}
