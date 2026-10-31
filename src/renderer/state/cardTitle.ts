import type { FileChange, TableChange } from '../../shared/types'
import { t } from '../i18n/en'
import type { CardModel } from './conversation'

export function fileName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

function fileTitle(change: FileChange, status: CardModel['status']): string {
  const name = fileName(change.path)
  if (status === 'failed') return t.card.fileFailed(name)
  const working = status === 'working'
  switch (change.status) {
    case 'created':
      return working ? t.card.creating(name) : t.card.created(name)
    case 'modified':
      return working ? t.card.editing(name) : t.card.updated(name)
    case 'deleted':
      return working ? t.card.deleting(name) : t.card.deleted(name)
  }
}

// One line on what happened to a table, for people who don't read SQL.
export function tableSummary(change: TableChange): string {
  const { table, added, changed, removed, filled, newColumns, totalRows } = change
  if (change.status === 'created') return t.table.created(table, totalRows)
  if (change.status === 'deleted') return t.table.deleted(table)
  const parts: string[] = []
  if (newColumns.length > 0) {
    const columns = t.table.addedColumns(newColumns)
    parts.push(filled > 0 ? `${columns}, ${t.table.filledIn(filled, totalRows)}` : columns)
  }
  if (added > 0) parts.push(t.table.rowsAdded(added))
  if (changed > 0) parts.push(t.table.rowsChanged(changed))
  if (removed > 0) parts.push(t.table.rowsRemoved(removed))
  return parts.length > 0 ? parts.join(' · ') : t.table.unchanged(table)
}

export function cardTitle(card: CardModel): string {
  if (card.files !== null) {
    const n = card.files.length
    if (card.status === 'failed') return t.card.filesFailed(n)
    return card.status === 'working' ? t.card.updatingFiles(n) : t.card.updatedFiles(n)
  }
  const { change } = card
  switch (change.type) {
    case 'file':
      return fileTitle(change, card.status)
    case 'command':
      if (!change.description && change.tables.length > 0 && card.status !== 'failed') {
        return t.card.updatedDatabase
      }
      if (change.description) {
        return card.status === 'failed' ? t.card.stepFailed(change.description) : change.description
      }
      if (card.status === 'failed') return t.card.commandFailed
      return card.status === 'working' ? t.card.runningCommand : t.card.ranCommand
    case 'activity': {
      const [first, ...rest] = change.items
      if (!first) return t.card.lookedAround
      return rest.length > 0 ? t.card.activityMore(first, rest.length) : first
    }
  }
}
