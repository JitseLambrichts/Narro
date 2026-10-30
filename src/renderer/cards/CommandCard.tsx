import type { CommandChange } from '../../shared/types'
import { t } from '../i18n/en'

// What a command changed, in plain view.
export function CommandSummary(p: { change: CommandChange }): React.JSX.Element {
  return (
    <ul className="command-files" aria-label={t.changedFiles}>
      {p.change.changedFiles.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
  )
}

// The command itself and its last output lines, shown only on request.
export function CommandCode(p: { change: CommandChange }): React.JSX.Element {
  const { change } = p
  return (
    <div className="command-code">
      <code className="command-text">{change.command}</code>
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
