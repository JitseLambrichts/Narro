import { describe, it, expect } from 'vitest'
import type { Change, CommandChange, FileChange, TableChange } from '../../shared/types'
import type { CardModel } from './conversation'
import { cardTitle, tableSummary } from './cardTitle'

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
    outputTail: [],
    tables: []
  }
}
function card(
  change: Change,
  status: CardModel['status'],
  files: FileChange[] | null = null
): CardModel {
  return {
    id: 'c',
    targetKey: 'k',
    status,
    change,
    files,
    startedAt: 0,
    lastAt: 0,
    expanded: false,
    working: []
  }
}
function table(over: Partial<TableChange>): TableChange {
  return {
    type: 'table',
    database: 'shop.db',
    table: 'klanten',
    status: 'modified',
    columns: ['naam'],
    newColumns: [],
    types: ['text'],
    schema: null,
    rows: [],
    added: 0,
    changed: 0,
    removed: 0,
    filled: 0,
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
    [card({ ...command(null), tables: [table({ added: 1 })] }, 'done'), 'Updated the database'],
    [card({ ...command('Import'), tables: [table({ added: 1 })] }, 'done'), 'Import']
  ])('%#: %s', (c, title) => expect(cardTitle(c)).toBe(title))
})

describe('tableSummary', () => {
  it.each([
    [table({ status: 'created', added: 4 }), 'Created klanten with 4 rows'],
    [table({ status: 'deleted', removed: 4 }), 'Deleted klanten'],
    [table({ added: 1 }), '1 row added'],
    [table({ added: 2, changed: 1, removed: 3 }), '2 rows added · 1 row changed · 3 rows removed'],
    [table({ newColumns: ['email'] }), 'Added column email'],
    [table({ newColumns: ['email'], filled: 3 }), 'Added column email, filled in 3 of 4'],
    [table({ newColumns: ['a', 'b'] }), 'Added columns a, b'],
    [table({}), 'Changed the layout of klanten']
  ])('%#: %s', (change, text) => expect(tableSummary(change)).toBe(text))
})
