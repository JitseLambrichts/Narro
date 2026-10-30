import type { FileChange } from '../../shared/types'
import { t } from '../i18n/en'
import { DiffLines } from './DiffLines'

export function FileCard(p: { change: FileChange }): React.JSX.Element | null {
  if (p.change.tooLarge) return <p className="card-note">{t.tooLargeNote}</p>
  if (p.change.lines.length === 0) return null
  return <DiffLines lines={p.change.lines} />
}
