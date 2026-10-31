import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { activityLabel, PROGRESS_POLL_MS, ToolObserver } from './registry'
import type { VisualChange } from '../../shared/types'

let tmp: string
let o: ToolObserver

function seq(): () => string {
  let n = 0
  return () => `id${++n}`
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'observer-'))
  o = new ToolObserver({ projectDir: tmp, newId: seq() })
})

describe('ToolObserver', () => {
  it('Write of a new file: start (created, no lines) then done with the diff', async () => {
    const input = { file_path: join(tmp, 'notes.md'), content: 'a\nb\n' }
    const [s] = await o.before('t1', 'Write', input)
    expect(s).toMatchObject({
      id: 'id1',
      toolUseId: 't1',
      phase: 'start',
      targetKey: 'file:notes.md',
      change: { type: 'file', status: 'created', lines: [] }
    })
    writeFileSync(input.file_path, input.content)
    const [d] = await o.after('t1', 'Write', input, {}, 40, false)
    expect(d).toMatchObject({
      id: 'id2',
      phase: 'done',
      targetKey: 'file:notes.md',
      change: { status: 'created', added: 2 }
    })
  })

  it('Edit of an existing file starts as modified and shows the changed lines', async () => {
    mkdirSync(join(tmp, 'src'))
    const file = join(tmp, 'src/app.tsx')
    writeFileSync(file, 'a\nb\n')
    const input = { file_path: file, old_string: 'b', new_string: 'c' }
    const [s] = await o.before('t1', 'Edit', input)
    expect(s).toMatchObject({
      targetKey: 'file:src/app.tsx',
      change: { status: 'modified', lines: [] }
    })
    writeFileSync(file, 'a\nc\n')
    const [d] = await o.after('t1', 'Edit', input, {}, 5, false)
    expect(d.change).toMatchObject({ status: 'modified', added: 1, removed: 1 })
  })

  it('a failed Edit ends in phase failed', async () => {
    const input = { file_path: join(tmp, 'x.ts'), old_string: 'a', new_string: 'b' }
    await o.before('t1', 'Edit', input)
    const [last] = await o.after('t1', 'Edit', input, undefined, null, true)
    expect(last.phase).toBe('failed')
  })

  it('Bash: running card, then done with changed files, duration and the last 5 output lines', async () => {
    const input = { command: 'node gen.js', description: 'Generate the report' }
    const [s] = await o.before('t2', 'Bash', input)
    expect(s).toMatchObject({ phase: 'start', targetKey: 'command:t2' })
    expect(s.change).toEqual({
      type: 'command',
      command: 'node gen.js',
      description: 'Generate the report',
      status: 'running',
      durationMs: null,
      changedFiles: [],
      outputTail: [],
      tables: []
    })
    writeFileSync(join(tmp, 'out.txt'), 'x')
    const [d] = await o.after('t2', 'Bash', input, { stdout: '1\n2\n3\n4\n5\n6\n7' }, 1200, false)
    expect(d).toMatchObject({ phase: 'done', targetKey: 'command:t2' })
    expect(d.change).toMatchObject({
      status: 'done',
      durationMs: 1200,
      changedFiles: ['out.txt'],
      outputTail: ['3', '4', '5', '6', '7']
    })
  })

  it('a failed Bash command ends with status failed', async () => {
    const input = { command: 'npm test' }
    await o.before('t2', 'Bash', input)
    const [d] = await o.after('t2', 'Bash', input, undefined, null, true)
    expect(d.phase).toBe('failed')
    expect(d.change).toMatchObject({ status: 'failed', description: null, outputTail: [] })
  })

  it('Read becomes a finished activity item in before() and nothing in after()', async () => {
    expect(await o.before('t3', 'Read', { file_path: join(tmp, 'src/app.tsx') })).toMatchObject([
      {
        phase: 'done',
        targetKey: 'activity',
        change: { type: 'activity', items: ['Read app.tsx'] }
      }
    ])
    expect(await o.after('t3', 'Read', {}, {}, 5, false)).toEqual([])
  })

  it('task tools produce no visual change', async () => {
    expect(await o.before('t4', 'TaskCreate', { subject: 'x' })).toEqual([])
    expect(await o.after('t4', 'TaskCreate', { subject: 'x' }, {}, 1, false)).toEqual([])
  })

  it.each([
    ['Grep', { pattern: 'customer' }, 'Searched for “customer”'],
    ['Glob', { pattern: '**/*.ts' }, 'Looked for **/*.ts'],
    ['WebSearch', { query: 'sqlite tips' }, 'Searched the web for “sqlite tips”'],
    ['WebFetch', { url: 'https://example.com/a' }, 'Opened example.com'],
    ['WebFetch', { url: 'not a url' }, 'Opened a web page'],
    ['Read', {}, 'Read a file'],
    ['Mystery', {}, 'Used Mystery']
  ])('activityLabel(%s)', (tool, input, label) => expect(activityLabel(tool, input)).toBe(label))
})

describe('ToolObserver and databases', () => {
  it('a command that creates a database carries its new table', async () => {
    const input = {
      command: 'sqlite3 klanten.db < klanten.sql',
      description: 'Create the customer list'
    }
    await o.before('t5', 'Bash', input)
    const db = new DatabaseSync(join(tmp, 'klanten.db'))
    db.exec("CREATE TABLE klanten (naam TEXT); INSERT INTO klanten VALUES ('Emma'), ('Lucas');")
    db.close()
    const changes = await o.after('t5', 'Bash', input, { stdout: '' }, 30, false)
    expect(changes).toHaveLength(1)
    expect(changes[0].change).toMatchObject({
      type: 'command',
      changedFiles: ['klanten.db'],
      tables: [{ table: 'klanten', status: 'created', added: 2, columns: ['naam'] }]
    })
  })

  it('a command that changes rows carries only what changed', async () => {
    const db = new DatabaseSync(join(tmp, 'shop.db'))
    db.exec(
      "CREATE TABLE klanten (naam TEXT, stad TEXT); INSERT INTO klanten VALUES ('Emma', 'Hasselt'), ('Lucas', 'Gent');"
    )
    db.close()
    const input = { command: 'python update.py' }
    await o.before('t6', 'Bash', input)
    const again = new DatabaseSync(join(tmp, 'shop.db'))
    again.exec("UPDATE klanten SET stad = 'Brussel' WHERE naam = 'Lucas'")
    again.close()
    const [command] = await o.after('t6', 'Bash', input, { stdout: '' }, 30, false)
    expect(command.change).toMatchObject({
      tables: [
        {
          status: 'modified',
          changed: 1,
          rows: [{ kind: 'changed', cells: ['Lucas', 'Brussel'], changedCells: [1] }]
        }
      ]
    })
  })

  it('a command that leaves the data alone carries no tables', async () => {
    const db = new DatabaseSync(join(tmp, 'shop.db'))
    db.exec('CREATE TABLE t (x); INSERT INTO t VALUES (1);')
    db.close()
    await o.before('t7', 'Bash', { command: 'ls' })
    const [command] = await o.after('t7', 'Bash', { command: 'ls' }, { stdout: '' }, 5, false)
    expect(command.change).toMatchObject({ tables: [] })
  })

  it('reports rows while the command is still running', async () => {
    const progress: VisualChange[] = []
    const watched = new ToolObserver({
      projectDir: tmp,
      newId: seq(),
      onProgress: (c) => progress.push(c)
    })
    const input = { command: 'python import.py', description: 'Import customers' }
    await watched.before('t8', 'Bash', input)
    const db = new DatabaseSync(join(tmp, 'live.db'))
    db.exec("CREATE TABLE klanten (naam TEXT); INSERT INTO klanten VALUES ('Emma');")
    await new Promise((r) => setTimeout(r, PROGRESS_POLL_MS * 3))
    db.exec("INSERT INTO klanten VALUES ('Lucas');")
    db.close()
    await new Promise((r) => setTimeout(r, PROGRESS_POLL_MS * 3))
    expect(progress.length).toBeGreaterThanOrEqual(2)
    expect(progress[0]).toMatchObject({
      phase: 'progress',
      targetKey: 'command:t8',
      change: { status: 'running', tables: [{ table: 'klanten', added: 1 }] }
    })
    expect(progress.at(-1)!.change).toMatchObject({ tables: [{ added: 2 }] })

    await watched.after('t8', 'Bash', input, { stdout: '' }, 900, false)
    const count = progress.length
    await new Promise((r) => setTimeout(r, PROGRESS_POLL_MS * 2))
    expect(progress).toHaveLength(count)
  })
})
