import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { activityLabel, ToolObserver } from './registry'

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
      outputTail: []
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
