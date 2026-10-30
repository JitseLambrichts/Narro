import { describe, it, expect } from 'vitest'
import type { Change, CommandChange, FileChange } from '../../shared/types'
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
    ]
  ])('%#: %s', (c, title) => expect(cardTitle(c)).toBe(title))
})
