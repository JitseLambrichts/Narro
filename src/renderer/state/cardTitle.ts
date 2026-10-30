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

function tableTitle(change: TableChange): string {
  const { table, added, changed, removed, newColumns } = change
  if (change.status === 'created') return t.card.createdTable(table)
  if (change.status === 'deleted') return t.card.deletedTable(table)
  const kinds = [added, changed, removed, newColumns.length].filter((n) => n > 0).length
  if (kinds !== 1) return t.card.updatedTable(table)
  if (added > 0) return t.card.addedRows(added, table)
  if (removed > 0) return t.card.removedRows(removed, table)
  if (changed > 0) return t.card.changedRows(changed, table)
  return t.card.addedColumns(newColumns.length, table)
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
    case 'table':
      return tableTitle(change)
  }
}
