import { describe, it, expect } from 'vitest'
import type { Change, CommandChange, FileChange, TableChange } from '../../shared/types'
import type { CardModel } from './conversation'
import { cardTitle } from './cardTitle'

function file(path: string, status: FileChange['status'], added = 0, removed = 0): FileChange {
  return { type: 'file', path, status, lines: [], added, removed, tooLarge: false }
}
function command(description: string | null): CommandChange {
  return {
    type: 'command',
    command: 'x',
    description,
    status: 'running',
    durationMs: null,
    changedFiles: [],
    outputTail: []
  }
}
function card(
  change: Change,
  status: CardModel['status'],
  files: FileChange[] | null = null
): CardModel {
  return { id: 'c', targetKey: 'k', status, change, files, lastAt: 0, expanded: false, working: [] }
}
function table(over: Partial<TableChange>): TableChange {
  return {
    type: 'table',
    database: 'shop.db',
    table: 'klanten',
    status: 'modified',
    columns: ['naam'],
    newColumns: [],
    rows: [],
    added: 0,
    changed: 0,
    removed: 0,
    moreRows: 0,
    totalRows: 4,
    ...over
  }
}
const group = [file('a', 'created'), file('b', 'modified'), file('c', 'modified')]

describe('cardTitle', () => {
  it.each([
    [card(file('notes.md', 'created'), 'working'), 'Creating notes.md'],
    [card(file('src/app.tsx', 'modified'), 'working'), 'Editing app.tsx'],
    [card(file('old.css', 'deleted'), 'working'), 'Deleting old.css'],
    [card(file('notes.md', 'created'), 'done'), 'Created notes.md'],
    [card(file('src/app.tsx', 'modified', 3, 1), 'done'), 'Updated app.tsx'],
    [card(file('old.css', 'deleted'), 'done'), 'Deleted old.css'],
    [card(file('src/app.tsx', 'modified'), 'failed'), 'Could not change app.tsx'],
    [card(file('c', 'modified'), 'working', group), 'Updating 3 files'],
    [card(file('c', 'modified'), 'done', group), 'Updated 3 files'],
    [card(command('Generate the report'), 'working'), 'Generate the report'],
    [card(command('Generate the report'), 'done'), 'Generate the report'],
    [card(command(null), 'working'), 'Running a command'],
    [card(command(null), 'done'), 'Ran a command'],
    [card(command('Run tests'), 'failed'), 'Run tests failed'],
    [card(command(null), 'failed'), 'A command failed'],
    [card({ type: 'activity', items: ['Read a.ts'] }, 'done'), 'Read a.ts'],
    [
      card({ type: 'activity', items: ['Read a.ts', 'Read b.ts', 'Read c.ts'] }, 'done'),
      'Read a.ts and 2 more'
    ],
    [card(table({ status: 'created', added: 4 }), 'done'), 'Created table klanten'],
    [card(table({ status: 'deleted', removed: 4 }), 'done'), 'Deleted table klanten'],
    [card(table({ added: 1 }), 'done'), 'Added 1 row to klanten'],
    [card(table({ added: 3 }), 'done'), 'Added 3 rows to klanten'],
    [card(table({ removed: 2 }), 'done'), 'Removed 2 rows from klanten'],
    [card(table({ changed: 1 }), 'done'), 'Changed 1 row in klanten'],
    [card(table({ newColumns: ['email'] }), 'done'), 'Added a column to klanten'],
    [card(table({ added: 1, changed: 1 }), 'done'), 'Updated table klanten']
  ])('%#: %s', (c, title) => expect(cardTitle(c)).toBe(title))
})
